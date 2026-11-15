import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma, type Producto } from '../../../generated/prisma/client.js';
import { TipoMovimiento } from '../../../generated/prisma/enums.js';
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
 * Lo que un movimiento de stock le hace al producto. `cantidad` va con signo,
 * en la unidad del producto: positiva entra, negativa sale. Una compra trae su
 * costo unitario, que pasa a ser el costo del producto.
 */
export type StockChange = {
  productoId: string;
  cantidad: Prisma.Decimal | string;
} & (
  | { tipo: typeof TipoMovimiento.COMPRA; costoUnitario: string }
  | {
      tipo: typeof TipoMovimiento.AJUSTE | typeof TipoMovimiento.ORDEN_TRABAJO;
    }
);

/** Lo que la alerta de stock bajo muestra de cada producto. */
const LOW_STOCK_SUMMARY = {
  productoId: true,
  codigo: true,
  nombre: true,
  stock: true,
  stockMinimo: true,
  unidad: true,
} satisfies Prisma.ProductoSelect;

export type LowStockProduct = Prisma.ProductoGetPayload<{
  select: typeof LOW_STOCK_SUMMARY;
}>;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListProductsQueryDto): Promise<Page<Producto>> {
    const where = productsWhere(query, this.prisma.producto.fields.stockMinimo);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.producto.findMany({
        where,
        // El desempate por id hace que la paginación sea estable: con varios
        // productos del mismo stock o precio, el orden no cambia entre páginas.
        orderBy: [{ [query.ordenarPor]: query.sentido }, { productoId: 'asc' }],
        ...pageWindow(query.page, query.pageSize),
      }),
      this.prisma.producto.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  /**
   * Los productos activos con stock bajo (el mismo filtro `stockBajo` del
   * listado), los más urgentes primero: los que más le faltan para llegar a
   * su mínimo, y a igual falta, por nombre. `total` cuenta todos aunque solo
   * salgan `limit`.
   *
   * La falta (`stock - stockMinimo`) no se puede ordenar con Prisma sin una
   * consulta cruda, así que se ordena aquí: con stock bajo hay pocos productos,
   * no el catálogo entero.
   */
  async lowStock(
    limit: number,
  ): Promise<{ total: number; productos: LowStockProduct[] }> {
    const productos = await this.prisma.producto.findMany({
      where: productsWhere(
        { activo: true, stockBajo: true },
        this.prisma.producto.fields.stockMinimo,
      ),
      select: LOW_STOCK_SUMMARY,
    });
    return {
      total: productos.length,
      productos: sortByShortage(productos).slice(0, limit),
    };
  }

  async findOne(productoId: string): Promise<Producto> {
    const product = await this.prisma.producto.findUnique({
      where: { productoId },
    });
    if (!product) throw new NotFoundException(NOT_FOUND);
    return product;
  }

  // El código llega del DTO ya en mayúsculas, así que el índice único de la
  // base basta para impedir el repetido; su P2002 se traduce a un 409 propio.
  async create(data: CreateProductDto): Promise<Producto> {
    try {
      return await this.prisma.producto.create({ data });
    } catch (error) {
      throw translateDuplicate(error);
    }
  }

  async update(productoId: string, data: UpdateProductDto): Promise<Producto> {
    await this.findOne(productoId);
    try {
      return await this.prisma.producto.update({
        where: { productoId },
        data,
      });
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
   *   salida —o su devolución al quitar el detalle— tiene que poder
   *   registrarse.
   * - **Una compra actualiza el costo** del producto al de la compra.
   *
   * Devuelve el producto ya actualizado, con el stock y el costo nuevos.
   */
  async applyStockChange(
    tx: Prisma.TransactionClient,
    change: StockChange,
  ): Promise<Producto> {
    const { productoId } = change;
    const delta = new Prisma.Decimal(change.cantidad);
    const requiresActive = change.tipo !== TipoMovimiento.ORDEN_TRABAJO;

    const { count } = await tx.producto.updateMany({
      where: {
        productoId,
        ...(requiresActive && { activo: true }),
        ...(delta.isNegative() && { stock: { gte: delta.negated() } }),
      },
      data: {
        stock: { increment: delta },
        ...(change.tipo === TipoMovimiento.COMPRA && {
          costo: change.costoUnitario,
        }),
      },
    });

    // Se lee después de escribir, en la misma transacción: si se aplicó, es el
    // producto actualizado; si no, dice por qué no.
    const product = await tx.producto.findUnique({ where: { productoId } });
    if (!product) throw new NotFoundException(NOT_FOUND);
    if (count === 0) {
      if (requiresActive && !product.activo) {
        throw new BadRequestException(INACTIVE);
      }
      throw new ConflictException(
        `Stock insuficiente: quedan ${product.stock.toFixed(2)} de ${product.codigo}`,
      );
    }
    return product;
  }

  /**
   * Borra el producto de verdad. Si ya tiene movimientos de stock o se usó en
   * órdenes, la base no lo permite (RESTRICT); se comprueba antes para decir
   * por qué, en vez del mensaje genérico de la clave foránea.
   */
  async remove(productoId: string): Promise<void> {
    const product = await this.prisma.producto.findUnique({
      where: { productoId },
      select: {
        _count: { select: { movimientos: true, detallesOrden: true } },
      },
    });
    if (!product) throw new NotFoundException(NOT_FOUND);

    const { movimientos, detallesOrden } = product._count;
    const history = [
      movimientos &&
        `${movimientos} ${movimientos === 1 ? 'movimiento' : 'movimientos'} de stock`,
      detallesOrden &&
        `${detallesOrden} ${detallesOrden === 1 ? 'ítem' : 'ítems'} de órdenes de trabajo`,
    ].filter(Boolean);
    if (history.length) {
      throw new ConflictException(
        `No se puede eliminar: el producto tiene historial (${history.join(' y ')}). Puedes desactivarlo para que deje de ofrecerse`,
      );
    }
    await this.prisma.producto.delete({ where: { productoId } });
  }
}

/**
 * El `where` del listado. `stockMinimo` es la referencia a la columna
 * (`prisma.producto.fields.stockMinimo`): el stock bajo compara dos columnas
 * de la misma fila, y eso no se puede escribir con un valor fijo.
 */
export function productsWhere(
  query: Pick<ListProductsQueryDto, 'search' | 'tipo' | 'activo' | 'stockBajo'>,
  stockMinimo: Prisma.FieldRef<'Producto', 'Decimal'>,
): Prisma.ProductoWhereInput {
  const text = { contains: query.search, mode: 'insensitive' } as const;
  return {
    tipo: query.tipo,
    activo: query.activo,
    ...(query.stockBajo !== undefined && {
      stock: query.stockBajo ? { lte: stockMinimo } : { gt: stockMinimo },
    }),
    ...(query.search && {
      OR: [{ codigo: text }, { nombre: text }, { marca: text }],
    }),
  };
}

/** De la falta más grande (stock menos mínimo, el más negativo) a la menor. */
export function sortByShortage<
  T extends Pick<Producto, 'nombre' | 'stock' | 'stockMinimo'>,
>(productos: readonly T[]): T[] {
  return [...productos].sort(
    (a, b) =>
      a.stock.minus(a.stockMinimo).comparedTo(b.stock.minus(b.stockMinimo)) ||
      a.nombre.localeCompare(b.nombre, 'es'),
  );
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
