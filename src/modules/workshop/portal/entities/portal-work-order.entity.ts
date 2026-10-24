import { ApiProperty } from '@nestjs/swagger';
import {
  QuoteStatus,
  WorkOrderStatus,
} from '../../../../generated/prisma/enums.js';
import { fromDateColumn } from '../../../../shared/date-column.js';
import type { WorkOrderWithRelations } from '../../work-orders/entities/work-order.entity.js';
import { workOrderAmounts } from '../../work-orders/work-order-totals.js';
import { PortalWorkOrderVehicle } from './portal-work-order-vehicle.entity.js';

/** Lo que trae una orden para el listado del portal. */
export type PortalWorkOrderModel = Omit<WorkOrderWithRelations, 'items'> & {
  items: WorkOrderWithRelations['items'];
  quotes: { quoteId: string; status?: QuoteStatus }[];
};

/**
 * Una orden del cliente en su portal. Se copia campo por campo: sin el número
 * correlativo del taller, sin datos del personal y sin costos. El código de
 * seguimiento es la referencia que el cliente conoce.
 */
export class PortalWorkOrder {
  constructor(order: PortalWorkOrderModel) {
    this.workOrderId = order.workOrderId;
    this.trackingCode = order.trackingCode;
    this.status = order.status;
    this.reason = order.reason;
    this.vehicle = new PortalWorkOrderVehicle(order.vehicle);
    this.receivedAt = order.receivedAt;
    this.promisedDate =
      order.promisedDate && fromDateColumn(order.promisedDate);
    this.deliveredAt = order.deliveredAt;
    this.total = workOrderAmounts(order.items).total.toFixed(2);
    // Solo cuenta mientras la orden espera: una versión que quedó pendiente
    // en una orden cancelada ya no se responde.
    this.hasPendingQuote =
      order.status === WorkOrderStatus.WAITING_APPROVAL &&
      order.quotes.some(
        (quote) =>
          (quote.status ?? QuoteStatus.PENDING) === QuoteStatus.PENDING,
      );
  }

  @ApiProperty({ format: 'uuid' })
  workOrderId: string;

  @ApiProperty({ example: 'AFM-7K3Q9X', description: 'Código de seguimiento' })
  trackingCode: string;

  @ApiProperty({ enum: WorkOrderStatus, enumName: 'WorkOrderStatus' })
  status: WorkOrderStatus;

  @ApiProperty({ example: 'Ruido al frenar' })
  reason: string;

  @ApiProperty({ type: PortalWorkOrderVehicle })
  vehicle: PortalWorkOrderVehicle;

  @ApiProperty({ format: 'date-time' })
  receivedAt: Date;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-10-20',
  })
  promisedDate: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deliveredAt: Date | null;

  @ApiProperty({ example: '450.00', description: 'En soles' })
  total: string;

  @ApiProperty({
    description: 'Hay un presupuesto esperando su respuesta',
  })
  hasPendingQuote: boolean;
}
