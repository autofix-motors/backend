import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { TipoMovimiento } from '../../../generated/prisma/enums.js';
import { limaDayRange } from '../../../shared/lima-dates.js';
import {
  pageWindow,
  paginationMeta,
  type Page,
} from '../../../shared/pagination.js';
import {
  ProductsService,
  type StockChange,
} from '../products/products.service.js';
import type { CreateAdjustmentDto } from './dto/create-adjustment.dto.js';
import type { CreatePurchaseDto } from './dto/create-purchase.dto.js';
import type { ListStockMovementsQueryDto } from './dto/list-stock-movements-query.dto.js';
import type { StockMovementWithRelations } from './entities/stock-movement.entity.js';

// El producto y quién lo registró se leen por las relaciones del propio
// movimiento: es leer el modelo de este módulo, no consultar las tablas de
// productos o usuarios por su cuenta.
const WITH_RELATIONS = {
  producto: {
    select: { productoId: true, codigo: true, nombre: true, unidad: true },
  },
  creadoPor: { select: { usuarioId: true, nombre: true } },
} satisfies Prisma.MovimientoStockInclude;

const NOT_FOUND = 'No se encontró el movimiento';
const INVERTED_RANGE = 'La fecha desde no puede ser posterior a la fecha hasta';

/**
 * Un movimiento por registrar: el cambio de stock que aplica al producto, más
 * quién lo registra y su nota. El consumo en una orden lleva el detalle que lo
 * generó (un detalle mueve stock una sola vez). La devolución de un detalle
 * quitado de la orden también es ORDEN_TRABAJO —revierte un consumo, no es un
 * ajuste de inventario—, pero va sin detalle (ya no existe) y con la nota
 * obligatoria, que dice de qué orden vuelve.
 */
export type NewStockMovement = StockChange & {
  creadoPorId: string;
  nota?: string | null;
} & (
    | { tipo: typeof TipoMovimiento.ORDEN_TRABAJO; detalleOrdenId: string }
    | {
        tipo: typeof TipoMovimiento.ORDEN_TRABAJO;
        detalleOrdenId: null;
        nota: string;
      }
    | {
        tipo: typeof TipoMovimiento.COMPRA | typeof TipoMovimiento.AJUSTE;
      }
  );

@Injectable()
export class StockMovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  async findAll(
    query: ListStockMovementsQueryDto,
  ): Promise<Page<StockMovementWithRelations>> {
    // Comparar el texto basta: AAAA-MM-DD ordena igual que las fechas.
    if (query.desde && query.hasta && query.desde > query.hasta) {
      throw new BadRequestException(INVERTED_RANGE);
    }
    const where = stockMovementsWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.movimientoStock.findMany({
        where,
        include: WITH_RELATIONS,
        // El desempate por id hace que la paginación sea estable: con varios
        // movimientos del mismo instante o la misma cantidad, el orden no
        // cambia entre páginas.
        orderBy: [
          { [query.ordenarPor]: query.sentido },
          { movimientoStockId: 'asc' },
        ],
        ...pageWindow(query.page, query.pageSize),
      }),
      this.prisma.movimientoStock.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  async findOne(
    movimientoStockId: string,
  ): Promise<StockMovementWithRelations> {
    const movement = await this.prisma.movimientoStock.findUnique({
      where: { movimientoStockId },
      include: WITH_RELATIONS,
    });
    if (!movement) throw new NotFoundException(NOT_FOUND);
    return movement;
  }

  purchase(
    dto: CreatePurchaseDto,
    creadoPorId: string,
  ): Promise<StockMovementWithRelations> {
    return this.prisma.$transaction((tx) =>
      this.record(tx, {
        tipo: TipoMovimiento.COMPRA,
        productoId: dto.productoId,
        cantidad: dto.cantidad,
        costoUnitario: dto.costoUnitario,
        nota: dto.nota,
        creadoPorId,
      }),
    );
  }

  adjust(
    dto: CreateAdjustmentDto,
    creadoPorId: string,
  ): Promise<StockMovementWithRelations> {
    return this.prisma.$transaction((tx) =>
      this.record(tx, {
        tipo: TipoMovimiento.AJUSTE,
        productoId: dto.productoId,
        cantidad: dto.cantidad,
        nota: dto.nota,
        creadoPorId,
      }),
    );
  }

  /**
   * Registra un movimiento y mueve el stock del producto en la transacción
   * `tx` del llamador: o se guardan los dos o ninguno. Las compras y los
   * ajustes abren la suya; el consumo en una orden la comparte con el detalle
   * que lo genera, para que el detalle no quede sin su salida (y la
   * devolución, con el borrado del detalle, para que no vuelva dos veces). Un
   * movimiento no se edita ni se borra: se corrige con un ajuste.
   *
   * El costo unitario es el del producto después de aplicar el cambio: en una
   * compra, el de la compra (que pasó a ser el del producto); en un ajuste o
   * un consumo, el costo con que salió o entró.
   */
  async record(
    tx: Prisma.TransactionClient,
    movement: NewStockMovement,
  ): Promise<StockMovementWithRelations> {
    const product = await this.products.applyStockChange(tx, movement);
    return tx.movimientoStock.create({
      data: {
        productoId: movement.productoId,
        tipo: movement.tipo,
        cantidad: movement.cantidad,
        costoUnitario: product.costo,
        detalleOrdenId:
          movement.tipo === TipoMovimiento.ORDEN_TRABAJO
            ? movement.detalleOrdenId
            : null,
        nota: movement.nota ?? null,
        creadoPorId: movement.creadoPorId,
      },
      include: WITH_RELATIONS,
    });
  }
}

/**
 * El `where` del listado. El rango de fechas son días de Lima: `hasta`
 * incluye su día entero.
 */
export function stockMovementsWhere(
  query: Pick<
    ListStockMovementsQueryDto,
    'search' | 'tipo' | 'productoId' | 'desde' | 'hasta'
  >,
): Prisma.MovimientoStockWhereInput {
  const text = { contains: query.search, mode: 'insensitive' } as const;
  return {
    tipo: query.tipo,
    productoId: query.productoId,
    creadoEn: limaDayRange(query.desde, query.hasta),
    ...(query.search && {
      OR: [
        { producto: { codigo: text } },
        { producto: { nombre: text } },
        { nota: text },
      ],
    }),
  };
}
