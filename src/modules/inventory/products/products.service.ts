import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma, type Product } from '../../../generated/prisma/client.js';
import {
  pageWindow,
  paginationMeta,
  type Page,
} from '../../../shared/pagination.js';
import type { CreateProductDto } from './dto/create-product.dto.js';
import type { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import type { UpdateProductDto } from './dto/update-product.dto.js';

const NOT_FOUND = 'No se encontró el producto';
const DUPLICATE = 'Ya existe un producto con ese código';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListProductsQueryDto): Promise<Page<Product>> {
    const where = productsWhere(query, this.prisma.product.fields.minStock);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        // El desempate por id hace que la paginación sea estable: con varios
        // productos del mismo stock o precio, el orden no cambia entre páginas.
        orderBy: [{ [query.sortBy]: query.sortOrder }, { productId: 'asc' }],
        ...pageWindow(query.page, query.pageSize),
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  async findOne(productId: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({
      where: { productId },
    });
    if (!product) throw new NotFoundException(NOT_FOUND);
    return product;
  }

  // El código llega del DTO ya en mayúsculas, así que el índice único de la
  // base basta para impedir el repetido; su P2002 se traduce a un 409 propio.
  async create(data: CreateProductDto): Promise<Product> {
    try {
      return await this.prisma.product.create({ data });
    } catch (error) {
      throw translateDuplicate(error);
    }
  }

  async update(productId: string, data: UpdateProductDto): Promise<Product> {
    await this.findOne(productId);
    try {
      return await this.prisma.product.update({ where: { productId }, data });
    } catch (error) {
      throw translateDuplicate(error);
    }
  }

  /**
   * Borra el producto de verdad. Si ya tiene movimientos de stock o se usó en
   * órdenes, la base no lo permite (RESTRICT); se comprueba antes para decir
   * por qué, en vez del mensaje genérico de la clave foránea.
   */
  async remove(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { productId },
      select: { _count: { select: { movements: true, workOrderItems: true } } },
    });
    if (!product) throw new NotFoundException(NOT_FOUND);

    const { movements, workOrderItems } = product._count;
    const history = [
      movements &&
        `${movements} ${movements === 1 ? 'movimiento' : 'movimientos'} de stock`,
      workOrderItems &&
        `${workOrderItems} ${workOrderItems === 1 ? 'ítem' : 'ítems'} de órdenes de trabajo`,
    ].filter(Boolean);
    if (history.length) {
      throw new ConflictException(
        `No se puede eliminar: el producto tiene historial (${history.join(' y ')}). Puedes desactivarlo para que deje de ofrecerse`,
      );
    }
    await this.prisma.product.delete({ where: { productId } });
  }
}

/**
 * El `where` del listado. `minStock` es la referencia a la columna
 * (`prisma.product.fields.minStock`): el stock bajo compara dos columnas de la
 * misma fila, y eso no se puede escribir con un valor fijo.
 */
export function productsWhere(
  query: Pick<
    ListProductsQueryDto,
    'search' | 'kind' | 'isActive' | 'lowStock'
  >,
  minStock: Prisma.FieldRef<'Product', 'Decimal'>,
): Prisma.ProductWhereInput {
  const text = { contains: query.search, mode: 'insensitive' } as const;
  return {
    kind: query.kind,
    isActive: query.isActive,
    ...(query.lowStock !== undefined && {
      stock: query.lowStock ? { lte: minStock } : { gt: minStock },
    }),
    ...(query.search && {
      OR: [{ code: text }, { name: text }, { brand: text }],
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
