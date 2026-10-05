import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import {
  Prisma,
  type ServiceCatalogItem,
} from '../../../generated/prisma/client.js';
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

  async findAll(
    query: ListServiceCatalogQueryDto,
  ): Promise<Page<ServiceCatalogItem>> {
    const where = serviceCatalogWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.serviceCatalogItem.findMany({
        where,
        // El desempate por id hace que la paginación sea estable: con varios
        // servicios del mismo precio, el orden no cambia entre páginas.
        orderBy: [
          { [query.sortBy]: query.sortOrder },
          { serviceCatalogItemId: 'asc' },
        ],
        ...pageWindow(query.page, query.pageSize),
      }),
      this.prisma.serviceCatalogItem.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  async findOne(serviceCatalogItemId: string): Promise<ServiceCatalogItem> {
    const item = await this.prisma.serviceCatalogItem.findUnique({
      where: { serviceCatalogItemId },
    });
    if (!item) throw new NotFoundException(NOT_FOUND);
    return item;
  }

  async create(data: CreateServiceCatalogItemDto): Promise<ServiceCatalogItem> {
    await this.assertNameIsFree(data.name);
    try {
      return await this.prisma.serviceCatalogItem.create({ data });
    } catch (error) {
      throw translateDuplicate(error);
    }
  }

  async update(
    serviceCatalogItemId: string,
    data: UpdateServiceCatalogItemDto,
  ): Promise<ServiceCatalogItem> {
    await this.findOne(serviceCatalogItemId);
    if (data.name) await this.assertNameIsFree(data.name, serviceCatalogItemId);

    try {
      return await this.prisma.serviceCatalogItem.update({
        where: { serviceCatalogItemId },
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
  async remove(serviceCatalogItemId: string): Promise<void> {
    const item = await this.prisma.serviceCatalogItem.findUnique({
      where: { serviceCatalogItemId },
      select: { _count: { select: { workOrderItems: true } } },
    });
    if (!item) throw new NotFoundException(NOT_FOUND);

    const { workOrderItems } = item._count;
    if (workOrderItems) {
      throw new ConflictException(
        `No se puede eliminar: el servicio ya se usó en ${workOrderItems} ${workOrderItems === 1 ? 'ítem' : 'ítems'} de órdenes de trabajo. Puedes desactivarlo para que deje de ofrecerse`,
      );
    }
    await this.prisma.serviceCatalogItem.delete({
      where: { serviceCatalogItemId },
    });
  }

  /**
   * La base solo impide repetir el nombre escrito igual; «cambio de aceite» y
   * «Cambio de aceite» serían dos servicios que nadie distingue en una lista.
   * Se compara sin mayúsculas antes de guardar, y el error de la base queda de
   * respaldo si dos altas coinciden.
   */
  private async assertNameIsFree(
    name: string,
    exceptServiceCatalogItemId?: string,
  ): Promise<void> {
    const existing = await this.prisma.serviceCatalogItem.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptServiceCatalogItemId && {
          NOT: { serviceCatalogItemId: exceptServiceCatalogItemId },
        }),
      },
      select: { serviceCatalogItemId: true },
    });
    if (existing) throw new ConflictException(DUPLICATE);
  }
}

export function serviceCatalogWhere(
  query: Pick<
    ListServiceCatalogQueryDto,
    'search' | 'isActive' | 'minPrice' | 'maxPrice'
  >,
): Prisma.ServiceCatalogItemWhereInput {
  const { minPrice, maxPrice } = query;
  if (minPrice && maxPrice && new Prisma.Decimal(minPrice).gt(maxPrice)) {
    throw new BadRequestException(INVERTED_RANGE);
  }

  const text = { contains: query.search, mode: 'insensitive' } as const;
  return {
    isActive: query.isActive,
    ...((minPrice || maxPrice) && {
      laborPrice: { gte: minPrice, lte: maxPrice },
    }),
    ...(query.search && {
      OR: [{ name: text }, { description: text }],
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
