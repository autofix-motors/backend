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

export type WorkOrderWithTimeline = Omit<WorkOrderWithRelations, 'detalles'> & {
  creadoPor: WorkOrderUserModel;
  eventos: WorkOrderEventWithAuthor[];
  detalles: WorkOrderItemWithProduct[];
  presupuestos: QuoteWithRelations[];
};

/**
 * Una orden completa, para su pantalla de detalle: lo del listado más el
 * diagnóstico, la cancelación, quién la registró, la línea de tiempo, los
 * servicios y repuestos con sus montos y los presupuestos. El costo de los repuestos y su margen
 * salen solo con `incluirCostos` (ADMINISTRADOR).
 *
 * Extiende `WorkOrder` (una clase concreta, con `super(order)`), no una base
 * abstracta: el detalle es el mismo recurso con más campos, y repetir los del
 * listado haría que uno cambie sin el otro.
 */
export class WorkOrderDetail extends WorkOrder {
  constructor(
    order: WorkOrderWithTimeline,
    { incluirCostos }: { incluirCostos: boolean },
    today: string = limaToday(),
  ) {
    super(order, today);
    this.diagnostico = order.diagnostico;
    this.canceladaEn = order.canceladaEn;
    this.motivoCancelacion = order.motivoCancelacion;
    this.creadoPor = new WorkOrderUser(order.creadoPor);
    this.eventos = order.eventos.map((event) => new WorkOrderEvent(event));
    this.detalles = order.detalles.map(
      (item) => new WorkOrderItem(item, { incluirCostos }),
    );
    this.totales = new WorkOrderTotals(workOrderAmounts(order.detalles), {
      incluirCostos,
    });
    this.presupuestos = order.presupuestos.map(
      (presupuesto) => new Quote(presupuesto),
    );
  }

  @ApiProperty({ type: String, nullable: true })
  diagnostico: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  canceladaEn: Date | null;

  @ApiProperty({ type: String, nullable: true })
  motivoCancelacion: string | null;

  @ApiProperty({ type: WorkOrderUser, description: 'Quién la registró' })
  creadoPor: WorkOrderUser;

  @ApiProperty({
    type: [WorkOrderEvent],
    description: 'La línea de tiempo, de la más antigua a la más reciente',
  })
  eventos: WorkOrderEvent[];

  @ApiProperty({
    type: [WorkOrderItem],
    description: 'Servicios y repuestos, en el orden en que se agregaron',
  })
  detalles: WorkOrderItem[];

  @ApiProperty({ type: WorkOrderTotals })
  totales: WorkOrderTotals;

  @ApiProperty({
    type: [Quote],
    description:
      'Los presupuestos enviados, de la versión más nueva a la más vieja',
  })
  presupuestos: Quote[];
}
