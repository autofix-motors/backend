import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { LoginIdentifier } from '../../../core/auth/login-identifier.js';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  pageWindow,
  paginationMeta,
  type Page,
} from '../../../shared/pagination.js';
import { documentNumberError } from '../../../shared/document-number.js';
import { SessionsService } from '../../core/sessions/sessions.service.js';
import type { CreateCustomerDto } from './dto/create-customer.dto.js';
import type { ListCustomersQueryDto } from './dto/list-customers-query.dto.js';
import type { UpdateCustomerDto } from './dto/update-customer.dto.js';
import type { CustomerWithCounts } from './entities/customer.entity.js';

const WITH_COUNTS = {
  _count: { select: { vehicles: true } },
  // Si tiene acceso al portal: sin el hash, que nunca sale de customer-accounts.
  account: {
    select: { createdAt: true, lastLoginAt: true, mustChangePassword: true },
  },
} satisfies Prisma.CustomerInclude;

/** Cuántos candidatos se prueban como máximo en un login por correo. */
const MAX_LOGIN_CANDIDATES = 5;

/** Lo que el login del portal necesita de un cliente con acceso. */
export interface CustomerLoginCandidate {
  customerId: string;
  name: string;
  isActive: boolean;
}

const NOT_FOUND = 'No se encontró el cliente';
const DUPLICATE = 'Ya existe un cliente con ese tipo y número de documento';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  async findAll(
    query: ListCustomersQueryDto,
  ): Promise<Page<CustomerWithCounts>> {
    const where = customersWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        include: WITH_COUNTS,
        // El desempate por id hace que la paginación sea estable: con dos
        // clientes del mismo nombre, el orden no cambia entre páginas.
        orderBy: [{ [query.sortBy]: query.sortOrder }, { customerId: 'asc' }],
        ...pageWindow(query.page, query.pageSize),
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  async findOne(customerId: string): Promise<CustomerWithCounts> {
    const customer = await this.prisma.customer.findUnique({
      where: { customerId },
      include: WITH_COUNTS,
    });
    if (!customer) throw new NotFoundException(NOT_FOUND);
    return customer;
  }

  async create(data: CreateCustomerDto): Promise<CustomerWithCounts> {
    try {
      return await this.prisma.customer.create({ data, include: WITH_COUNTS });
    } catch (error) {
      throw translateDuplicate(error);
    }
  }

  async update(
    customerId: string,
    data: UpdateCustomerDto,
  ): Promise<CustomerWithCounts> {
    const current = await this.findOne(customerId);

    // El DTO valida el número contra el tipo solo si el cuerpo trae los dos.
    // Si cambia uno solo, la combinación se valida aquí con el guardado.
    if (data.documentType || data.documentNumber) {
      const message = documentNumberError(
        data.documentType ?? current.documentType,
        data.documentNumber ?? current.documentNumber,
      );
      if (message) throw new BadRequestException(message);
    }

    let customer: CustomerWithCounts;
    try {
      customer = await this.prisma.customer.update({
        where: { customerId },
        data,
        include: WITH_COUNTS,
      });
    } catch (error) {
      throw translateDuplicate(error);
    }
    // Un cliente inactivo no entra a su portal: se cortan sus sesiones para
    // que tampoco pueda renovar la que tenga abierta.
    if (current.isActive && data.isActive === false) {
      await this.sessions.revokeAllForCustomer(customerId);
    }
    return customer;
  }

  /**
   * Los clientes con acceso al portal que coinciden con lo que se escribió al
   * iniciar sesión. Pueden ser varios: el número de documento solo es único
   * junto con su tipo, y el correo no es único. El login prueba la contraseña
   * contra cada uno.
   */
  findLoginCandidates(
    identifier: LoginIdentifier,
  ): Promise<CustomerLoginCandidate[]> {
    return this.prisma.customer.findMany({
      where: {
        account: { isNot: null },
        ...(identifier.kind === 'email'
          ? { email: identifier.value }
          : { documentNumber: identifier.value }),
      },
      select: { customerId: true, name: true, isActive: true },
      orderBy: { customerId: 'asc' },
      take: MAX_LOGIN_CANDIDATES,
    });
  }

  /**
   * Borra el cliente de verdad. Si tiene vehículos u órdenes la base no lo
   * permite (RESTRICT); se comprueba antes para decir por qué, en vez del
   * mensaje genérico de la clave foránea.
   */
  async remove(customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findUnique({
      where: { customerId },
      select: { _count: { select: { vehicles: true, workOrders: true } } },
    });
    if (!customer) throw new NotFoundException(NOT_FOUND);

    const { vehicles, workOrders } = customer._count;
    if (vehicles || workOrders) {
      throw new ConflictException(
        `No se puede eliminar: el cliente tiene ${describeHistory(vehicles, workOrders)}. Puedes desactivarlo`,
      );
    }
    await this.prisma.customer.delete({ where: { customerId } });
  }
}

export function customersWhere(
  query: Pick<ListCustomersQueryDto, 'search' | 'documentType' | 'isActive'>,
): Prisma.CustomerWhereInput {
  return {
    documentType: query.documentType,
    isActive: query.isActive,
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        // El número se guarda normalizado: se busca igual, para que
        // «20-1234» encuentre «201234…».
        {
          documentNumber: {
            contains: query.search.replace(/[\s.-]/g, ''),
            mode: 'insensitive',
          },
        },
      ],
    }),
  };
}

function describeHistory(vehicles: number, workOrders: number): string {
  const parts = [
    vehicles && `${vehicles} ${vehicles === 1 ? 'vehículo' : 'vehículos'}`,
    workOrders &&
      `${workOrders} ${workOrders === 1 ? 'orden de trabajo' : 'órdenes de trabajo'}`,
  ].filter(Boolean);
  return parts.join(' y ');
}

function translateDuplicate(error: unknown): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new ConflictException(DUPLICATE);
  }
  return error;
}
