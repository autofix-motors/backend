import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma, type Servicio } from '../../../generated/prisma/client.js';
import {
  pageWindow,
  paginationMeta,
  type Page,
} from '../../../shared/pagination.js';
import type { CreateServiceCatalogItemDto } from './dto/create-service-catalog-item.dto.js';
import type { ListServiceCatalogQueryDto } from './dto/list-service-catalog-query.dto.js';
import type { UpdateServiceCatalogItemDto } from './dto/update-service-catalog-item.dto.js';

const NOT_FOUND = 'No se encontró el servicio';
const DUPLICATE = 'Ya existe un servicio con ese nombre';
const INVERTED_RANGE = 'El precio mínimo no puede ser mayor que el máximo';

@Injectable()
export class ServiceCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListServiceCatalogQueryDto): Promise<Page<Servicio>> {
    const where = serviceCatalogWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.servicio.findMany({
        where,
        // El desempate por id hace que la paginación sea estable: con varios
        // servicios del mismo precio, el orden no cambia entre páginas.
        orderBy: [{ [query.ordenarPor]: query.sentido }, { servicioId: 'asc' }],
        ...pageWindow(query.page, query.pageSize),
      }),
      this.prisma.servicio.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  async findOne(servicioId: string): Promise<Servicio> {
    const item = await this.prisma.servicio.findUnique({
      where: { servicioId },
    });
    if (!item) throw new NotFoundException(NOT_FOUND);
    return item;
  }

  async create(data: CreateServiceCatalogItemDto): Promise<Servicio> {
    await this.assertNameIsFree(data.nombre);
    try {
      return await this.prisma.servicio.create({ data });
    } catch (error) {
      throw translateDuplicate(error);
    }
  }

  async update(
    servicioId: string,
    data: UpdateServiceCatalogItemDto,
  ): Promise<Servicio> {
    await this.findOne(servicioId);
    if (data.nombre) await this.assertNameIsFree(data.nombre, servicioId);

    try {
      return await this.prisma.servicio.update({
        where: { servicioId },
        data,
      });
    } catch (error) {
      throw translateDuplicate(error);
    }
  }

  /**
   * Borra el servicio de verdad. Si ya se usó en alguna orden la base no lo
   * permite (RESTRICT); se comprueba antes para decir por qué, en vez del
   * mensaje genérico de la clave foránea.
   */
  async remove(servicioId: string): Promise<void> {
    const item = await this.prisma.servicio.findUnique({
      where: { servicioId },
      select: { _count: { select: { detallesOrden: true } } },
    });
    if (!item) throw new NotFoundException(NOT_FOUND);

    const { detallesOrden } = item._count;
    if (detallesOrden) {
      throw new ConflictException(
        `No se puede eliminar: el servicio ya se usó en ${detallesOrden} ${detallesOrden === 1 ? 'detalle' : 'detalles'} de órdenes de trabajo. Puedes desactivarlo para que deje de ofrecerse`,
      );
    }
    await this.prisma.servicio.delete({
      where: { servicioId },
    });
  }

  /**
   * La base solo impide repetir el nombre escrito igual; «cambio de aceite» y
   * «Cambio de aceite» serían dos servicios que nadie distingue en una lista.
   * Se compara sin mayúsculas antes de guardar, y el error de la base queda de
   * respaldo si dos altas coinciden.
   */
  private async assertNameIsFree(
    nombre: string,
    exceptServicioId?: string,
  ): Promise<void> {
    const existing = await this.prisma.servicio.findFirst({
      where: {
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(exceptServicioId && {
          NOT: { servicioId: exceptServicioId },
        }),
      },
      select: { servicioId: true },
    });
    if (existing) throw new ConflictException(DUPLICATE);
  }
}

export function serviceCatalogWhere(
  query: Pick<
    ListServiceCatalogQueryDto,
    'search' | 'activo' | 'precioMinimo' | 'precioMaximo'
  >,
): Prisma.ServicioWhereInput {
  const { precioMinimo, precioMaximo } = query;
  if (
    precioMinimo &&
    precioMaximo &&
    new Prisma.Decimal(precioMinimo).gt(precioMaximo)
  ) {
    throw new BadRequestException(INVERTED_RANGE);
  }

  const text = { contains: query.search, mode: 'insensitive' } as const;
  return {
    activo: query.activo,
    ...((precioMinimo || precioMaximo) && {
      precioManoObra: { gte: precioMinimo, lte: precioMaximo },
    }),
    ...(query.search && {
      OR: [{ nombre: text }, { descripcion: text }],
    }),
  };
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
