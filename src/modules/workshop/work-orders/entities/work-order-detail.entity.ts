import { ApiProperty } from '@nestjs/swagger';
import { limaToday } from '../../../../shared/lima-dates.js';
import { workOrderAmounts } from '../work-order-totals.js';
import { Quote, type QuoteWithRelations } from './quote.entity.js';
import {
  WorkOrderEvent,
  type WorkOrderEventWithAuthor,
} from './work-order-event.entity.js';
import {
  WorkOrderItem,
  type WorkOrderItemWithProduct,
} from './work-order-item.entity.js';
import { WorkOrderTotals } from './work-order-totals.entity.js';
import {
  WorkOrderUser,
  type WorkOrderUserModel,
} from './work-order-user.entity.js';
import { WorkOrder, type WorkOrderWithRelations } from './work-order.entity.js';

export type WorkOrderWithTimeline = Omit<WorkOrderWithRelations, 'items'> & {
  createdBy: WorkOrderUserModel;
  events: WorkOrderEventWithAuthor[];
  items: WorkOrderItemWithProduct[];
  quotes: QuoteWithRelations[];
};

/**
 * Una orden completa, para su pantalla de detalle: lo del listado más el
 * diagnóstico, la cancelación, quién la registró, la línea de tiempo, los
 * servicios y repuestos con sus montos y los presupuestos. El costo de los repuestos y su margen
 * salen solo con `includeCosts` (ADMIN).
 *
 * Extiende `WorkOrder` (una clase concreta, con `super(order)`), no una base
 * abstracta: el detalle es el mismo recurso con más campos, y repetir los del
 * listado haría que uno cambie sin el otro.
 */
export class WorkOrderDetail extends WorkOrder {
  constructor(
    order: WorkOrderWithTimeline,
    { includeCosts }: { includeCosts: boolean },
    today: string = limaToday(),
  ) {
    super(order, today);
    this.diagnosis = order.diagnosis;
    this.cancelledAt = order.cancelledAt;
    this.cancelReason = order.cancelReason;
    this.createdBy = new WorkOrderUser(order.createdBy);
    this.events = order.events.map((event) => new WorkOrderEvent(event));
    this.items = order.items.map(
      (item) => new WorkOrderItem(item, { includeCosts }),
    );
    this.totals = new WorkOrderTotals(workOrderAmounts(order.items), {
      includeCosts,
    });
    this.quotes = order.quotes.map((quote) => new Quote(quote));
  }

  @ApiProperty({ type: String, nullable: true })
  diagnosis: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt: Date | null;

  @ApiProperty({ type: String, nullable: true })
  cancelReason: string | null;

  @ApiProperty({ type: WorkOrderUser, description: 'Quién la registró' })
  createdBy: WorkOrderUser;

  @ApiProperty({
    type: [WorkOrderEvent],
    description: 'La línea de tiempo, de la más antigua a la más reciente',
  })
  events: WorkOrderEvent[];

  @ApiProperty({
    type: [WorkOrderItem],
    description: 'Servicios y repuestos, en el orden en que se agregaron',
  })
  items: WorkOrderItem[];

  @ApiProperty({ type: WorkOrderTotals })
  totals: WorkOrderTotals;

  @ApiProperty({
    type: [Quote],
    description:
      'Los presupuestos enviados, de la versión más nueva a la más vieja',
  })
  quotes: Quote[];
}
