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
  type DetalleOrden as WorkOrderItemModel,
} from '../../../generated/prisma/client.js';
import {
  TipoDetalle,
  TipoMovimiento,
  RolUsuario,
  EstadoOrden,
} from '../../../generated/prisma/enums.js';
import { ProductsService } from '../../inventory/products/products.service.js';
import { StockMovementsService } from '../../inventory/stock-movements/stock-movements.service.js';
import { ServiceCatalogService } from '../service-catalog/service-catalog.service.js';
import type { CreateWorkOrderItemDto } from './dto/create-work-order-item.dto.js';
import type { UpdateWorkOrderItemDto } from './dto/update-work-order-item.dto.js';
import type { WorkOrderWithTimeline } from './entities/work-order-detail.entity.js';
import { formatWorkOrderNumber } from './work-order-codes.js';
import { moneyText } from './work-order-totals.js';
import {
  canChangeItems,
  WORK_ORDER_STATUS_LABELS,
} from './work-order-status.js';
import { WITH_TIMELINE, WorkOrdersService } from './work-orders.service.js';

const ITEM_NOT_FOUND = 'No se encontró el detalle en esta orden';
const PRICES_ADMIN_ONLY =
  'Solo el administrador fija el precio o la descripción de un detalle';
const PRODUCT_QUANTITY_FIXED =
  'La cantidad de un repuesto no se cambia: quítalo y vuelve a agregarlo con la cantidad correcta';
const SERVICE_WITH_PRODUCT = 'Un servicio no lleva repuesto (productoId)';
const PRODUCT_WITH_SERVICE =
  'Un repuesto no lleva servicio del catálogo (servicioId)';
const INACTIVE_SERVICE =
  'El servicio está inactivo: actívalo en el catálogo antes de agregarlo';
const INACTIVE_PRODUCT =
  'El repuesto está inactivo: actívalo antes de agregarlo a una orden';
const STALE_STATUS =
  'La orden cambió de estado mientras tanto: vuelve a cargarla';

/** Lo que se va a escribir de un detalle nuevo, ya resuelto desde su original. */
type NewItem = Pick<
  Prisma.DetalleOrdenUncheckedCreateInput,
  | 'tipo'
  | 'servicioId'
  | 'productoId'
  | 'descripcion'
  | 'cantidad'
  | 'precioUnitario'
  | 'costoUnitario'
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
 * (`StockMovementsService.record`). Por eso su cantidad no se edita: un detalle
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
    ordenTrabajoId: string,
    dto: CreateWorkOrderItemDto,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    const order = await this.workOrders.findOne(ordenTrabajoId, actor);
    assertItemsOpen(order.estado);
    assertPricesAllowed(dto, actor);
    const item = await this.resolveNewItem(dto);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.detalleOrden.create({
        data: { ...item, ordenTrabajoId },
      });
      if (created.productoId) {
        // Si no alcanza, `applyStockChange` lanza 409 «Stock insuficiente» y
        // la transacción se deshace: el detalle tampoco queda.
        await this.stockMovements.record(tx, {
          tipo: TipoMovimiento.ORDEN_TRABAJO,
          productoId: created.productoId,
          cantidad: created.cantidad.negated(),
          detalleOrdenId: created.detalleOrdenId,
          // La orden en la nota: si el detalle se quita, el movimiento pierde
          // su `detalleOrdenId` (SetNull) y el kardex sigue diciendo de qué
          // orden salió.
          nota: `Consumo en ${formatWorkOrderNumber(order.numero)}`,
          creadoPorId: actor.usuarioId,
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
    ordenTrabajoId: string,
    detalleOrdenId: string,
    dto: UpdateWorkOrderItemDto,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    const order = await this.workOrders.findOne(ordenTrabajoId, actor);
    assertItemsOpen(order.estado);
    assertPricesAllowed(dto, actor);
    const current = findItem(order, detalleOrdenId);
    if (current.tipo === TipoDetalle.PRODUCTO && dto.cantidad !== undefined) {
      throw new BadRequestException(PRODUCT_QUANTITY_FIXED);
    }

    const changes = describeChanges(current, dto);
    // Nada distinto de lo que ya tenía: no se escribe ni se anota.
    if (!changes) return order;

    return this.prisma.$transaction(async (tx) => {
      await tx.detalleOrden.update({
        where: { detalleOrdenId },
        data: {
          cantidad: dto.cantidad,
          precioUnitario: dto.precioUnitario,
          descripcion: dto.descripcion,
        },
      });
      return this.logEvent(
        tx,
        order,
        `Se modificó «${current.descripcion}»: ${changes}`,
        actor,
      );
    });
  }

  /**
   * Quita el detalle. Un repuesto vuelve al stock con un movimiento ORDEN_TRABAJO
   * positivo, sin detalle y con la orden en la nota: el consumo original queda en
   * el kardex (sin su detalle, por el SetNull) y la devolución lo compensa. No es
   * un ajuste porque no corrige el inventario, deshace un consumo, y porque un
   * ajuste exige el producto activo: un repuesto desactivado después de
   * usarse se tiene que poder devolver igual.
   */
  async remove(
    ordenTrabajoId: string,
    detalleOrdenId: string,
    actor: SessionUser,
  ): Promise<void> {
    const order = await this.workOrders.findOne(ordenTrabajoId, actor);
    assertItemsOpen(order.estado);
    const item = findItem(order, detalleOrdenId);

    await this.prisma.$transaction(async (tx) => {
      // Si otro lo quitó entre medio, el `delete` no encuentra nada (P2025,
      // 404) y el stock no vuelve dos veces.
      await tx.detalleOrden.delete({ where: { detalleOrdenId } });
      if (item.productoId) {
        await this.stockMovements.record(tx, {
          tipo: TipoMovimiento.ORDEN_TRABAJO,
          productoId: item.productoId,
          cantidad: item.cantidad,
          detalleOrdenId: null,
          nota: `Devolución: detalle quitado de ${formatWorkOrderNumber(order.numero)}`,
          creadoPorId: actor.usuarioId,
        });
      }
      const returned =
        item.tipo === TipoDetalle.PRODUCTO ? ' (vuelve al stock)' : '';
      await this.logEvent(
        tx,
        order,
        `Se quitó: ${describeLine(item)}${returned}`,
        actor,
      );
    });
  }

  /**
   * Lo que se va a guardar de un detalle nuevo: la descripción y el precio del
   * original (salvo los que mande el administrador) y, en un repuesto, su
   * costo vigente, congelado. El original tiene que existir (404) y estar
   * activo (400): se pregunta a su módulo, sin leer sus tablas.
   */
  private async resolveNewItem(dto: CreateWorkOrderItemDto): Promise<NewItem> {
    const cantidad = dto.cantidad ?? '1';
    if (dto.tipo === TipoDetalle.SERVICIO) {
      if (dto.productoId !== undefined) {
        throw new BadRequestException(SERVICE_WITH_PRODUCT);
      }
      const service = await this.serviceCatalog.findOne(
        dto.servicioId as string,
      );
      if (!service.activo) throw new BadRequestException(INACTIVE_SERVICE);
      return {
        tipo: TipoDetalle.SERVICIO,
        servicioId: service.servicioId,
        productoId: null,
        descripcion: dto.descripcion ?? service.nombre,
        cantidad,
        precioUnitario: dto.precioUnitario ?? service.precioManoObra,
        costoUnitario: null,
      };
    }

    if (dto.servicioId !== undefined) {
      throw new BadRequestException(PRODUCT_WITH_SERVICE);
    }
    const producto = await this.products.findOne(dto.productoId as string);
    if (!producto.activo) throw new BadRequestException(INACTIVE_PRODUCT);
    return {
      tipo: TipoDetalle.PRODUCTO,
      servicioId: null,
      productoId: producto.productoId,
      descripcion: dto.descripcion ?? `${producto.codigo} · ${producto.nombre}`,
      cantidad,
      precioUnitario: dto.precioUnitario ?? producto.precio,
      costoUnitario: producto.costo,
    };
  }

  /**
   * Anota el cambio en la línea de tiempo (interno: el cliente ve el total en
   * el presupuesto, no cada línea que se movió) y devuelve la orden completa.
   * Escribe con el estado leído en el `where`: si cambió entre medio, P2025 →
   * 409, y como corre dentro de la transacción, el detalle y el stock se deshacen.
   */
  private async logEvent(
    tx: Prisma.TransactionClient,
    order: { ordenTrabajoId: string; estado: EstadoOrden },
    nota: string,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    try {
      return await tx.ordenTrabajo.update({
        where: { ordenTrabajoId: order.ordenTrabajoId, estado: order.estado },
        data: {
          eventos: {
            create: { nota, esPublico: false, creadoPorId: actor.usuarioId },
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

function assertItemsOpen(estado: EstadoOrden): void {
  if (!canChangeItems(estado)) {
    throw new ConflictException(
      `Los servicios y repuestos no se pueden cambiar con la orden en «${WORK_ORDER_STATUS_LABELS[estado]}»`,
    );
  }
}

/**
 * El precio y la descripción los fija solo el administrador: lo que se cobra
 * es una decisión de la caja. 403 (y no ignorarlos) para que el mecánico sepa
 * que no se guardó lo que escribió.
 */
function assertPricesAllowed(
  dto: { precioUnitario?: string; descripcion?: string },
  actor: SessionUser,
): void {
  if (
    actor.rol !== RolUsuario.ADMINISTRADOR &&
    (dto.precioUnitario !== undefined || dto.descripcion !== undefined)
  ) {
    throw new ForbiddenException(PRICES_ADMIN_ONLY);
  }
}

/** El detalle de esta orden; uno de otra orden, para ella, no existe. */
function findItem(
  order: WorkOrderWithTimeline,
  detalleOrdenId: string,
): WorkOrderItemModel {
  const item = order.detalles.find(
    (candidate) => candidate.detalleOrdenId === detalleOrdenId,
  );
  if (!item) throw new NotFoundException(ITEM_NOT_FOUND);
  return item;
}

/** «2 × FA-TOY-90915 · Filtro de aceite (S/ 35.00 c/u)». */
export function describeLine(
  item: Pick<WorkOrderItemModel, 'descripcion' | 'cantidad' | 'precioUnitario'>,
): string {
  return `${quantityText(item.cantidad)} × ${item.descripcion} (${moneyText(item.precioUnitario)} c/u)`;
}

/**
 * Qué cambia de un detalle, para la línea de tiempo («cantidad 1 → 2, precio
 * S/ 80.00 → S/ 90.00»), o vacío si lo pedido es lo que ya tenía.
 */
export function describeChanges(
  current: Pick<
    WorkOrderItemModel,
    'descripcion' | 'cantidad' | 'precioUnitario'
  >,
  dto: UpdateWorkOrderItemDto,
): string {
  const changes: string[] = [];
  if (dto.cantidad !== undefined && !current.cantidad.equals(dto.cantidad)) {
    changes.push(
      `cantidad ${quantityText(current.cantidad)} → ${quantityText(new Prisma.Decimal(dto.cantidad))}`,
    );
  }
  if (
    dto.precioUnitario !== undefined &&
    !current.precioUnitario.equals(dto.precioUnitario)
  ) {
    changes.push(
      `precio ${moneyText(current.precioUnitario)} → ${moneyText(new Prisma.Decimal(dto.precioUnitario))}`,
    );
  }
  if (
    dto.descripcion !== undefined &&
    dto.descripcion !== current.descripcion
  ) {
    changes.push(`descripción «${dto.descripcion}»`);
  }
  return changes.join(', ');
}

/** «2» si es entera, «1.25» si no: nadie dice «2.00 filtros». */
function quantityText(cantidad: Prisma.Decimal): string {
  return cantidad.isInteger() ? cantidad.toFixed(0) : cantidad.toFixed(2);
}
