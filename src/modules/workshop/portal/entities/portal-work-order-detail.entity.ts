import { ApiProperty } from '@nestjs/swagger';
import type { WorkOrderWithTimeline } from '../../work-orders/entities/work-order-detail.entity.js';
import { workOrderAmounts } from '../../work-orders/work-order-totals.js';
import { PortalEvent } from './portal-event.entity.js';
import { PortalLine } from './portal-line.entity.js';
import { PortalQuote } from './portal-quote.entity.js';
import { PortalTotals } from './portal-totals.entity.js';
import { PortalWorkOrder } from './portal-work-order.entity.js';

/**
 * Una orden completa, como la ve el cliente en su portal: lo del listado más
 * el kilometraje, el diagnóstico, el mecánico, los servicios y repuestos con
 * sus montos, la línea de tiempo **pública** y los presupuestos.
 *
 * Nunca: costos, márgenes, notas internas, el número correlativo ni quién del
 * personal hizo cada cosa (salvo el nombre del mecánico asignado).
 */
export class PortalWorkOrderDetail extends PortalWorkOrder {
  constructor(order: WorkOrderWithTimeline) {
    super(order);
    this.mileageIn = order.mileageIn;
    this.diagnosis = order.diagnosis;
    this.mechanicName = order.mechanic?.name ?? null;
    this.cancelReason = order.cancelReason;
    this.items = order.items.map((item) => new PortalLine(item));
    this.totals = new PortalTotals(workOrderAmounts(order.items));
    this.events = order.events
      .filter((event) => event.isPublic)
      .map((event) => new PortalEvent(event));
    this.quotes = order.quotes.map((quote) => new PortalQuote(quote));
  }

  @ApiProperty({ example: 85000 })
  mileageIn: number;

  @ApiProperty({ type: String, nullable: true })
  diagnosis: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Juan Quispe',
    description: 'El mecánico que atiende su vehículo',
  })
  mechanicName: string | null;

  @ApiProperty({ type: String, nullable: true })
  cancelReason: string | null;

  @ApiProperty({ type: [PortalLine] })
  items: PortalLine[];

  @ApiProperty({ type: PortalTotals })
  totals: PortalTotals;

  @ApiProperty({
    type: [PortalEvent],
    description: 'Solo los eventos públicos, del más antiguo al más nuevo',
  })
  events: PortalEvent[];

  @ApiProperty({
    type: [PortalQuote],
    description:
      'Las versiones del presupuesto, de la más nueva a la más vieja',
  })
  quotes: PortalQuote[];
}
