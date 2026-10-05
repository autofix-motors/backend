import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { StockMovementType } from '../../../generated/prisma/enums.js';
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
  product: {
    select: { productId: true, code: true, name: true, unit: true },
  },
  createdBy: { select: { userId: true, name: true } },
} satisfies Prisma.StockMovementInclude;

const NOT_FOUND = 'No se encontró el movimiento';
const INVERTED_RANGE = 'La fecha desde no puede ser posterior a la fecha hasta';

/**
 * Un movimiento por registrar: el cambio de stock que aplica al producto, más
 * quién lo registra y su nota. El consumo en una orden lleva el ítem que lo
 * generó (obligatorio en WORK_ORDER: un ítem mueve stock una sola vez).
 */
export type NewStockMovement = StockChange & {
  createdById: string;
  note?: string | null;
} & (
    | { type: typeof StockMovementType.WORK_ORDER; workOrderItemId: string }
    | {
        type:
          | typeof StockMovementType.PURCHASE
          | typeof StockMovementType.ADJUSTMENT;
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
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException(INVERTED_RANGE);
    }
    const where = stockMovementsWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        include: WITH_RELATIONS,
        // El desempate por id hace que la paginación sea estable: con varios
        // movimientos del mismo instante o la misma cantidad, el orden no
        // cambia entre páginas.
        orderBy: [
          { [query.sortBy]: query.sortOrder },
          { stockMovementId: 'asc' },
        ],
        ...pageWindow(query.page, query.pageSize),
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  async findOne(stockMovementId: string): Promise<StockMovementWithRelations> {
    const movement = await this.prisma.stockMovement.findUnique({
      where: { stockMovementId },
      include: WITH_RELATIONS,
    });
    if (!movement) throw new NotFoundException(NOT_FOUND);
    return movement;
  }

  purchase(
    dto: CreatePurchaseDto,
    createdById: string,
  ): Promise<StockMovementWithRelations> {
    return this.prisma.$transaction((tx) =>
      this.record(tx, {
        type: StockMovementType.PURCHASE,
        productId: dto.productId,
        quantity: dto.quantity,
        unitCost: dto.unitCost,
        note: dto.note,
        createdById,
      }),
    );
  }

  adjust(
    dto: CreateAdjustmentDto,
    createdById: string,
  ): Promise<StockMovementWithRelations> {
    return this.prisma.$transaction((tx) =>
      this.record(tx, {
        type: StockMovementType.ADJUSTMENT,
        productId: dto.productId,
        quantity: dto.quantity,
        note: dto.note,
        createdById,
      }),
    );
  }

  /**
   * Registra un movimiento y mueve el stock del producto en la transacción
   * `tx` del llamador: o se guardan los dos o ninguno. Las compras y los
   * ajustes abren la suya; el consumo en una orden la comparte con el ítem
   * que lo genera, para que el ítem no quede sin su salida. Un movimiento no
   * se edita ni se borra: se corrige con un ajuste.
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
    return tx.stockMovement.create({
      data: {
        productId: movement.productId,
        type: movement.type,
        quantity: movement.quantity,
        unitCost: product.cost,
        workOrderItemId:
          movement.type === StockMovementType.WORK_ORDER
            ? movement.workOrderItemId
            : null,
        note: movement.note ?? null,
        createdById: movement.createdById,
      },
      include: WITH_RELATIONS,
    });
  }
}

/**
 * El `where` del listado. El rango de fechas son días de Lima: `to` incluye su
 * día entero.
 */
export function stockMovementsWhere(
  query: Pick<
    ListStockMovementsQueryDto,
    'search' | 'type' | 'productId' | 'from' | 'to'
  >,
): Prisma.StockMovementWhereInput {
  const text = { contains: query.search, mode: 'insensitive' } as const;
  return {
    type: query.type,
    productId: query.productId,
    createdAt: limaDayRange(query.from, query.to),
    ...(query.search && {
      OR: [
        { product: { code: text } },
        { product: { name: text } },
        { note: text },
      ],
    }),
  };
}
