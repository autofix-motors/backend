import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SessionUser } from '../../../core/auth/session-user.js';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import {
  Prisma,
  type WorkOrderItem as WorkOrderItemModel,
} from '../../../generated/prisma/client.js';
import {
  ItemType,
  StockMovementType,
  UserRole,
  WorkOrderStatus,
} from '../../../generated/prisma/enums.js';
import { ProductsService } from '../../inventory/products/products.service.js';
import { StockMovementsService } from '../../inventory/stock-movements/stock-movements.service.js';
import { ServiceCatalogService } from '../service-catalog/service-catalog.service.js';
import type { CreateWorkOrderItemDto } from './dto/create-work-order-item.dto.js';
import type { UpdateWorkOrderItemDto } from './dto/update-work-order-item.dto.js';
import type { WorkOrderWithTimeline } from './entities/work-order-detail.entity.js';
import { formatWorkOrderNumber } from './work-order-codes.js';
import {
  canChangeItems,
  WORK_ORDER_STATUS_LABELS,
} from './work-order-status.js';
import { WITH_TIMELINE, WorkOrdersService } from './work-orders.service.js';

const ITEM_NOT_FOUND = 'No se encontró el ítem en esta orden';
const PRICES_ADMIN_ONLY =
  'Solo el administrador fija el precio o la descripción de un ítem';
const PRODUCT_QUANTITY_FIXED =
  'La cantidad de un repuesto no se cambia: quítalo y vuelve a agregarlo con la cantidad correcta';
const SERVICE_WITH_PRODUCT = 'Un servicio no lleva repuesto (productId)';
const PRODUCT_WITH_SERVICE =
  'Un repuesto no lleva servicio del catálogo (serviceCatalogItemId)';
const INACTIVE_SERVICE =
  'El servicio está inactivo: actívalo en el catálogo antes de agregarlo';
const INACTIVE_PRODUCT =
  'El repuesto está inactivo: actívalo antes de agregarlo a una orden';
const STALE_STATUS =
  'La orden cambió de estado mientras tanto: vuelve a cargarla';

/** Lo que se va a escribir de un ítem nuevo, ya resuelto desde su original. */
type NewItem = Pick<
  Prisma.WorkOrderItemUncheckedCreateInput,
  | 'type'
  | 'serviceCatalogItemId'
  | 'productId'
  | 'description'
  | 'quantity'
  | 'unitPrice'
  | 'unitCost'
>;

/**
 * Los servicios y repuestos de una orden. Viven en el módulo de órdenes y no
 * en uno propio porque son parte de la orden (se borran con ella y su total es
 * el de ella): el detalle los lee con la orden, y cada cambio responde la
 * orden completa con sus montos.
 *
 * Quién: el administrador, o el mecánico asignado (para cualquier otro, la
 * orden «no existe», como en el resto del módulo). El precio y la descripción
 * solo los fija el administrador.
 *
 * Cuándo: en los estados de `ITEM_STATUSES` (409 en los demás). Cada cambio
 * deja un evento interno en la línea de tiempo, en la misma transacción, y
 * escribe con el estado leído en el `where`: si la orden cambió de estado
 * entre medio, nada se guarda y se responde 409.
 *
 * Stock: un repuesto descuenta su cantidad al agregarse y la devuelve al
 * quitarse, con un movimiento de kardex en la misma transacción
 * (`StockMovementsService.record`). Por eso su cantidad no se edita: un ítem
 * mueve stock una sola vez.
 */
@Injectable()
export class WorkOrderItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrders: WorkOrdersService,
    private readonly serviceCatalog: ServiceCatalogService,
    private readonly products: ProductsService,
    private readonly stockMovements: StockMovementsService,
  ) {}

  async create(
    workOrderId: string,
    dto: CreateWorkOrderItemDto,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    const order = await this.workOrders.findOne(workOrderId, actor);
    assertItemsOpen(order.status);
    assertPricesAllowed(dto, actor);
    const item = await this.resolveNewItem(dto);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.workOrderItem.create({
        data: { ...item, workOrderId },
      });
      if (created.productId) {
        // Si no alcanza, `applyStockChange` lanza 409 «Stock insuficiente» y
        // la transacción se deshace: el ítem tampoco queda.
        await this.stockMovements.record(tx, {
          type: StockMovementType.WORK_ORDER,
          productId: created.productId,
          quantity: created.quantity.negated(),
          workOrderItemId: created.workOrderItemId,
          // La orden en la nota: si el ítem se quita, el movimiento pierde
          // su `workOrderItemId` (SetNull) y el kardex sigue diciendo de qué
          // orden salió.
          note: `Consumo en ${formatWorkOrderNumber(order.number)}`,
          createdById: actor.userId,
        });
      }
      return this.logEvent(
        tx,
        order,
        `Se agregó: ${describeLine(created)}`,
        actor,
      );
    });
  }

  async update(
    workOrderId: string,
    workOrderItemId: string,
    dto: UpdateWorkOrderItemDto,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    const order = await this.workOrders.findOne(workOrderId, actor);
    assertItemsOpen(order.status);
    assertPricesAllowed(dto, actor);
    const current = findItem(order, workOrderItemId);
    if (current.type === ItemType.PRODUCT && dto.quantity !== undefined) {
      throw new BadRequestException(PRODUCT_QUANTITY_FIXED);
    }

    const changes = describeChanges(current, dto);
    // Nada distinto de lo que ya tenía: no se escribe ni se anota.
    if (!changes) return order;

    return this.prisma.$transaction(async (tx) => {
      await tx.workOrderItem.update({
        where: { workOrderItemId },
        data: {
          quantity: dto.quantity,
          unitPrice: dto.unitPrice,
          description: dto.description,
        },
      });
      return this.logEvent(
        tx,
        order,
        `Se modificó «${current.description}»: ${changes}`,
        actor,
      );
    });
  }

  /**
   * Quita el ítem. Un repuesto vuelve al stock con un movimiento WORK_ORDER
   * positivo, sin ítem y con la orden en la nota: el consumo original queda en
   * el kardex (sin su ítem, por el SetNull) y la devolución lo compensa. No es
   * un ajuste porque no corrige el inventario, deshace un consumo, y porque un
   * ajuste exige el producto activo: un repuesto desactivado después de
   * usarse se tiene que poder devolver igual.
   */
  async remove(
    workOrderId: string,
    workOrderItemId: string,
    actor: SessionUser,
  ): Promise<void> {
    const order = await this.workOrders.findOne(workOrderId, actor);
    assertItemsOpen(order.status);
    const item = findItem(order, workOrderItemId);

    await this.prisma.$transaction(async (tx) => {
      // Si otro lo quitó entre medio, el `delete` no encuentra nada (P2025,
      // 404) y el stock no vuelve dos veces.
      await tx.workOrderItem.delete({ where: { workOrderItemId } });
      if (item.productId) {
        await this.stockMovements.record(tx, {
          type: StockMovementType.WORK_ORDER,
          productId: item.productId,
          quantity: item.quantity,
          workOrderItemId: null,
          note: `Devolución: ítem quitado de ${formatWorkOrderNumber(order.number)}`,
          createdById: actor.userId,
        });
      }
      const returned =
        item.type === ItemType.PRODUCT ? ' (vuelve al stock)' : '';
      await this.logEvent(
        tx,
        order,
        `Se quitó: ${describeLine(item)}${returned}`,
        actor,
      );
    });
  }

  /**
   * Lo que se va a guardar de un ítem nuevo: la descripción y el precio del
   * original (salvo los que mande el administrador) y, en un repuesto, su
   * costo vigente, congelado. El original tiene que existir (404) y estar
   * activo (400): se pregunta a su módulo, sin leer sus tablas.
   */
  private async resolveNewItem(dto: CreateWorkOrderItemDto): Promise<NewItem> {
    const quantity = dto.quantity ?? '1';
    if (dto.type === ItemType.SERVICE) {
      if (dto.productId !== undefined) {
        throw new BadRequestException(SERVICE_WITH_PRODUCT);
      }
      const service = await this.serviceCatalog.findOne(
        dto.serviceCatalogItemId as string,
      );
      if (!service.isActive) throw new BadRequestException(INACTIVE_SERVICE);
      return {
        type: ItemType.SERVICE,
        serviceCatalogItemId: service.serviceCatalogItemId,
        productId: null,
        description: dto.description ?? service.name,
        quantity,
        unitPrice: dto.unitPrice ?? service.laborPrice,
        unitCost: null,
      };
    }

    if (dto.serviceCatalogItemId !== undefined) {
      throw new BadRequestException(PRODUCT_WITH_SERVICE);
    }
    const product = await this.products.findOne(dto.productId as string);
    if (!product.isActive) throw new BadRequestException(INACTIVE_PRODUCT);
    return {
      type: ItemType.PRODUCT,
      serviceCatalogItemId: null,
      productId: product.productId,
      description: dto.description ?? `${product.code} · ${product.name}`,
      quantity,
      unitPrice: dto.unitPrice ?? product.price,
      unitCost: product.cost,
    };
  }

  /**
   * Anota el cambio en la línea de tiempo (interno: el cliente ve el total en
   * el presupuesto, no cada línea que se movió) y devuelve la orden completa.
   * Escribe con el estado leído en el `where`: si cambió entre medio, P2025 →
   * 409, y como corre dentro de la transacción, el ítem y el stock se deshacen.
   */
  private async logEvent(
    tx: Prisma.TransactionClient,
    order: { workOrderId: string; status: WorkOrderStatus },
    note: string,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    try {
      return await tx.workOrder.update({
        where: { workOrderId: order.workOrderId, status: order.status },
        data: {
          events: {
            create: { note, isPublic: false, createdById: actor.userId },
          },
        },
        include: WITH_TIMELINE,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new ConflictException(STALE_STATUS);
      }
      throw error;
    }
  }
}

function assertItemsOpen(status: WorkOrderStatus): void {
  if (!canChangeItems(status)) {
    throw new ConflictException(
      `Los servicios y repuestos no se pueden cambiar con la orden en «${WORK_ORDER_STATUS_LABELS[status]}»`,
    );
  }
}

/**
 * El precio y la descripción los fija solo el administrador: lo que se cobra
 * es una decisión de la caja. 403 (y no ignorarlos) para que el mecánico sepa
 * que no se guardó lo que escribió.
 */
function assertPricesAllowed(
  dto: { unitPrice?: string; description?: string },
  actor: SessionUser,
): void {
  if (
    actor.role !== UserRole.ADMIN &&
    (dto.unitPrice !== undefined || dto.description !== undefined)
  ) {
    throw new ForbiddenException(PRICES_ADMIN_ONLY);
  }
}

/** El ítem de esta orden; uno de otra orden, para ella, no existe. */
function findItem(
  order: WorkOrderWithTimeline,
  workOrderItemId: string,
): WorkOrderItemModel {
  const item = order.items.find(
    (candidate) => candidate.workOrderItemId === workOrderItemId,
  );
  if (!item) throw new NotFoundException(ITEM_NOT_FOUND);
  return item;
}

/** «2 × FA-TOY-90915 · Filtro de aceite (S/ 35.00 c/u)». */
export function describeLine(
  item: Pick<WorkOrderItemModel, 'description' | 'quantity' | 'unitPrice'>,
): string {
  return `${quantityText(item.quantity)} × ${item.description} (${moneyText(item.unitPrice)} c/u)`;
}

/**
 * Qué cambia de un ítem, para la línea de tiempo («cantidad 1 → 2, precio
 * S/ 80.00 → S/ 90.00»), o vacío si lo pedido es lo que ya tenía.
 */
export function describeChanges(
  current: Pick<WorkOrderItemModel, 'description' | 'quantity' | 'unitPrice'>,
  dto: UpdateWorkOrderItemDto,
): string {
  const changes: string[] = [];
  if (dto.quantity !== undefined && !current.quantity.equals(dto.quantity)) {
    changes.push(
      `cantidad ${quantityText(current.quantity)} → ${quantityText(new Prisma.Decimal(dto.quantity))}`,
    );
  }
  if (dto.unitPrice !== undefined && !current.unitPrice.equals(dto.unitPrice)) {
    changes.push(
      `precio ${moneyText(current.unitPrice)} → ${moneyText(new Prisma.Decimal(dto.unitPrice))}`,
    );
  }
  if (
    dto.description !== undefined &&
    dto.description !== current.description
  ) {
    changes.push(`descripción «${dto.description}»`);
  }
  return changes.join(', ');
}

/** «2» si es entera, «1.25» si no: nadie dice «2.00 filtros». */
function quantityText(quantity: Prisma.Decimal): string {
  return quantity.isInteger() ? quantity.toFixed(0) : quantity.toFixed(2);
}

function moneyText(amount: Prisma.Decimal): string {
  return `S/ ${amount.toFixed(2)}`;
}
