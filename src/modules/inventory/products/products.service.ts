import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma, type Product } from '../../../generated/prisma/client.js';
import { StockMovementType } from '../../../generated/prisma/enums.js';
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
const INACTIVE =
  'El producto está inactivo: actívalo antes de registrarle compras o ajustes';

/**
 * Lo que un movimiento de stock le hace al producto. `quantity` va con signo,
 * en la unidad del producto: positiva entra, negativa sale. Una compra trae su
 * costo unitario, que pasa a ser el costo del producto.
 */
export type StockChange = {
  productId: string;
  quantity: Prisma.Decimal | string;
} & (
  | { type: typeof StockMovementType.PURCHASE; unitCost: string }
  | {
      type:
        | typeof StockMovementType.ADJUSTMENT
        | typeof StockMovementType.WORK_ORDER;
    }
);

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
   * Aplica al producto el cambio de stock de un movimiento, dentro de la
   * transacción `tx` en la que el llamador crea ese movimiento: el stock es la
   * suma del kardex (redundancia deliberada) y los dos se guardan juntos o no
   * se guarda ninguno. Es la única escritura del stock: la tabla de productos
   * es de este módulo, así que los movimientos (y el consumo de las órdenes)
   * pasan por aquí en vez de escribirla por su cuenta.
   *
   * - **El stock nunca queda negativo.** Una salida se aplica con un solo
   *   `UPDATE … WHERE stock >= salida`: comparar y descontar en la misma
   *   sentencia hace que dos salidas a la vez no puedan llevarse lo mismo
   *   (Postgres vuelve a evaluar el `WHERE` de la segunda cuando la primera
   *   libera la fila). Si no alcanza, 409 con lo que queda.
   * - **Compras y ajustes exigen el producto activo** (400 si no). El consumo
   *   en una orden no: si el producto se desactivó con la orden ya armada, su
   *   salida —o su devolución al quitar el ítem— tiene que poder registrarse.
   * - **Una compra actualiza el costo** del producto al de la compra.
   *
   * Devuelve el producto ya actualizado, con el stock y el costo nuevos.
   */
  async applyStockChange(
    tx: Prisma.TransactionClient,
    change: StockChange,
  ): Promise<Product> {
    const { productId } = change;
    const delta = new Prisma.Decimal(change.quantity);
    const requiresActive = change.type !== StockMovementType.WORK_ORDER;

    const { count } = await tx.product.updateMany({
      where: {
        productId,
        ...(requiresActive && { isActive: true }),
        ...(delta.isNegative() && { stock: { gte: delta.negated() } }),
      },
      data: {
        stock: { increment: delta },
        ...(change.type === StockMovementType.PURCHASE && {
          cost: change.unitCost,
        }),
      },
    });

    // Se lee después de escribir, en la misma transacción: si se aplicó, es el
    // producto actualizado; si no, dice por qué no.
    const product = await tx.product.findUnique({ where: { productId } });
    if (!product) throw new NotFoundException(NOT_FOUND);
    if (count === 0) {
      if (requiresActive && !product.isActive) {
        throw new BadRequestException(INACTIVE);
      }
      throw new ConflictException(
        `Stock insuficiente: quedan ${product.stock.toFixed(2)} de ${product.code}`,
      );
    }
    return product;
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
