import { ApiProperty } from '@nestjs/swagger';
import { limaToday } from '../../../../shared/lima-dates.js';
import {
  WorkOrderEvent,
  type WorkOrderEventWithAuthor,
} from './work-order-event.entity.js';
import {
  WorkOrderUser,
  type WorkOrderUserModel,
} from './work-order-user.entity.js';
import { WorkOrder, type WorkOrderWithRelations } from './work-order.entity.js';

export type WorkOrderWithTimeline = WorkOrderWithRelations & {
  createdBy: WorkOrderUserModel;
  events: WorkOrderEventWithAuthor[];
};

/**
 * Una orden completa, para su pantalla de detalle: lo del listado más el
 * diagnóstico, la cancelación, quién la registró y la línea de tiempo.
 *
 * Extiende `WorkOrder` (una clase concreta, con `super(order)`), no una base
 * abstracta: el detalle es el mismo recurso con más campos, y repetir los del
 * listado haría que uno cambie sin el otro.
 */
export class WorkOrderDetail extends WorkOrder {
  constructor(order: WorkOrderWithTimeline, today: string = limaToday()) {
    super(order, today);
    this.diagnosis = order.diagnosis;
    this.cancelledAt = order.cancelledAt;
    this.cancelReason = order.cancelReason;
    this.createdBy = new WorkOrderUser(order.createdBy);
    this.events = order.events.map((event) => new WorkOrderEvent(event));
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
}
