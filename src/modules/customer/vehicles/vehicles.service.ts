import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  pageWindow,
  paginationMeta,
  type Page,
} from '../../../shared/pagination.js';
import { CustomersService } from '../customers/customers.service.js';
import type { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import type { ListVehiclesQueryDto } from './dto/list-vehicles-query.dto.js';
import type { UpdateVehicleDto } from './dto/update-vehicle.dto.js';
import type { BrandCount } from './entities/vehicle-brand.entity.js';
import type { VehicleWithRelations } from './entities/vehicle.entity.js';
import { normalizeIdentifier } from './vehicle-identifiers.js';

// El dueño se lee por la relación del propio vehículo: es leer el modelo de
// este módulo, no consultar la tabla de clientes por su cuenta.
const WITH_RELATIONS = {
  cliente: {
    select: {
      clienteId: true,
      nombre: true,
      tipoDocumento: true,
      numeroDocumento: true,
    },
  },
  _count: { select: { ordenes: true } },
} satisfies Prisma.VehiculoInclude;

const NOT_FOUND = 'No se encontró el vehículo';
const DUPLICATE_PLATE = 'Ya existe un vehículo con esa placa';
const DUPLICATE_VIN = 'Ya existe un vehículo con ese VIN';
const INACTIVE_CUSTOMER =
  'El cliente está inactivo: actívalo antes de asignarle un vehículo';

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
  ) {}

  async findAll(
    query: ListVehiclesQueryDto,
  ): Promise<Page<VehicleWithRelations>> {
    const where = vehiclesWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.vehiculo.findMany({
        where,
        include: WITH_RELATIONS,
        // El desempate por id hace que la paginación sea estable: con varios
        // vehículos de la misma marca, el orden no cambia entre páginas.
        orderBy: [{ [query.ordenarPor]: query.sentido }, { vehiculoId: 'asc' }],
        ...pageWindow(query.page, query.pageSize),
      }),
      this.prisma.vehiculo.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  /**
   * Los vehículos de un cliente, para su portal, con la misma búsqueda que el
   * listado del personal. Por placa, para que el orden no cambie entre visitas.
   */
  async findForCustomer(
    clienteId: string,
    query: Pick<ListVehiclesQueryDto, 'search' | 'page' | 'pageSize'>,
  ): Promise<Page<VehicleWithRelations>> {
    const where = vehiclesWhere({ clienteId, search: query.search });
    const [items, total] = await this.prisma.$transaction([
      this.prisma.vehiculo.findMany({
        where,
        include: WITH_RELATIONS,
        orderBy: [{ placa: 'asc' }, { vehiculoId: 'asc' }],
        ...pageWindow(query.page, query.pageSize),
      }),
      this.prisma.vehiculo.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  /** Un vehículo del cliente. Si es de otro, para él no existe: 404. */
  async findOneForCustomer(
    vehiculoId: string,
    clienteId: string,
  ): Promise<VehicleWithRelations> {
    const vehicle = await this.prisma.vehiculo.findFirst({
      where: { vehiculoId, clienteId },
      include: WITH_RELATIONS,
    });
    if (!vehicle) throw new NotFoundException(NOT_FOUND);
    return vehicle;
  }

  async findOne(vehiculoId: string): Promise<VehicleWithRelations> {
    const vehicle = await this.prisma.vehiculo.findUnique({
      where: { vehiculoId },
      include: WITH_RELATIONS,
    });
    if (!vehicle) throw new NotFoundException(NOT_FOUND);
    return vehicle;
  }

  /** Las marcas registradas, para elegir en el filtro en vez de escribirlas. */
  async brands(): Promise<BrandCount[]> {
    const groups = await this.prisma.vehiculo.groupBy({
      by: ['marca'],
      _count: { _all: true },
    });
    return mergeBrands(
      groups.map((group) => ({
        marca: group.marca,
        cantidadVehiculos: group._count._all,
      })),
    );
  }

  async create(data: CreateVehicleDto): Promise<VehicleWithRelations> {
    await this.assertCustomerAcceptsVehicles(data.clienteId);
    await this.assertUnique(data);
    try {
      return await this.prisma.vehiculo.create({
        data,
        include: WITH_RELATIONS,
      });
    } catch (error) {
      throw translateDuplicate(error);
    }
  }

  async update(
    vehiculoId: string,
    data: UpdateVehicleDto,
  ): Promise<VehicleWithRelations> {
    const current = await this.findOne(vehiculoId);

    // Solo se verifica el cliente si cambia: un vehículo de un cliente que se
    // desactivó después se tiene que poder seguir corrigiendo.
    if (data.clienteId && data.clienteId !== current.clienteId) {
      await this.assertCustomerAcceptsVehicles(data.clienteId);
    }
    await this.assertUnique(data, vehiculoId);

    try {
      return await this.prisma.vehiculo.update({
        where: { vehiculoId },
        data,
        include: WITH_RELATIONS,
      });
    } catch (error) {
      throw translateDuplicate(error);
    }
  }

  /**
   * Borra el vehículo de verdad. Si tiene órdenes de trabajo la base no lo
   * permite (RESTRICT); se comprueba antes para decir por qué, en vez del
   * mensaje genérico de la clave foránea.
   */
  async remove(vehiculoId: string): Promise<void> {
    const vehicle = await this.prisma.vehiculo.findUnique({
      where: { vehiculoId },
      select: { _count: { select: { ordenes: true } } },
    });
    if (!vehicle) throw new NotFoundException(NOT_FOUND);

    const { ordenes } = vehicle._count;
    if (ordenes) {
      throw new ConflictException(
        `No se puede eliminar: el vehículo tiene ${ordenes} ${ordenes === 1 ? 'orden de trabajo' : 'órdenes de trabajo'} en su historial`,
      );
    }
    await this.prisma.vehiculo.delete({ where: { vehiculoId } });
  }

  /**
   * El cliente tiene que existir y estar activo para recibir un vehículo. Se
   * pregunta a CustomersService: este módulo no lee la tabla de clientes.
   */
  private async assertCustomerAcceptsVehicles(
    clienteId: string,
  ): Promise<void> {
    const customer = await this.customers.findOne(clienteId);
    if (!customer.activo) throw new BadRequestException(INACTIVE_CUSTOMER);
  }

  /**
   * La base ya impide repetir la placa o el VIN, pero su error no dice de forma
   * estable cuál de los dos chocó. Se busca antes para dar el mensaje exacto;
   * el error de la base queda de respaldo si dos altas coinciden.
   */
  private async assertUnique(
    { placa, vin }: Pick<UpdateVehicleDto, 'placa' | 'vin'>,
    exceptVehicleId?: string,
  ): Promise<void> {
    const matches: Prisma.VehiculoWhereInput[] = [];
    if (placa) matches.push({ placa });
    if (vin) matches.push({ vin });
    if (!matches.length) return;

    const existing = await this.prisma.vehiculo.findFirst({
      where: {
        OR: matches,
        ...(exceptVehicleId && { NOT: { vehiculoId: exceptVehicleId } }),
      },
      select: { placa: true },
    });
    if (existing) {
      throw new ConflictException(
        existing.placa === placa ? DUPLICATE_PLATE : DUPLICATE_VIN,
      );
    }
  }
}

export function vehiclesWhere(
  query: Pick<ListVehiclesQueryDto, 'search' | 'clienteId' | 'marca'>,
): Prisma.VehiculoWhereInput {
  return {
    clienteId: query.clienteId,
    marca: query.marca
      ? { equals: query.marca, mode: 'insensitive' }
      : undefined,
    ...(query.search && { OR: searchConditions(query.search) }),
  };
}

function searchConditions(search: string): Prisma.VehiculoWhereInput[] {
  const text = { contains: search, mode: 'insensitive' } as const;
  const conditions: Prisma.VehiculoWhereInput[] = [
    { marca: text },
    { modelo: text },
    { cliente: { nombre: text } },
  ];
  // La placa se guarda normalizada: se busca igual, para que «abc-1»
  // encuentre «ABC123». Una búsqueda de solo guiones no busca placas.
  const placa = normalizeIdentifier(search);
  if (placa) conditions.unshift({ placa: { contains: placa } });
  return conditions;
}

/**
 * Junta las marcas escritas con distintas mayúsculas («Toyota», «TOYOTA»): el
 * filtro las compara sin distinguirlas, así que son una sola opción. Se
 * muestra la escritura más usada.
 */
export function mergeBrands(groups: BrandCount[]): BrandCount[] {
  const merged = new Map<string, BrandCount & { top: number }>();
  for (const { marca, cantidadVehiculos } of groups) {
    const key = marca.toLocaleLowerCase('es');
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { marca, cantidadVehiculos, top: cantidadVehiculos });
      continue;
    }
    current.cantidadVehiculos += cantidadVehiculos;
    if (cantidadVehiculos > current.top) {
      current.marca = marca;
      current.top = cantidadVehiculos;
    }
  }
  return [...merged.values()]
    .map(({ marca, cantidadVehiculos }) => ({ marca, cantidadVehiculos }))
    .sort((a, b) => a.marca.localeCompare(b.marca, 'es'));
}

function translateDuplicate(error: unknown): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new ConflictException('Ya existe un vehículo con esa placa o VIN');
  }
  return error;
}
