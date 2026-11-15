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
    this.kilometrajeIngreso = order.kilometrajeIngreso;
    this.diagnostico = order.diagnostico;
    this.nombreMecanico = order.mecanico?.nombre ?? null;
    this.motivoCancelacion = order.motivoCancelacion;
    this.detalles = order.detalles.map((item) => new PortalLine(item));
    this.totales = new PortalTotals(workOrderAmounts(order.detalles));
    this.eventos = order.eventos
      .filter((event) => event.esPublico)
      .map((event) => new PortalEvent(event));
    this.presupuestos = order.presupuestos.map(
      (presupuesto) => new PortalQuote(presupuesto),
    );
  }

  @ApiProperty({ example: 85000 })
  kilometrajeIngreso: number;

  @ApiProperty({ type: String, nullable: true })
  diagnostico: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Juan Quispe',
    description: 'El mecánico que atiende su vehículo',
  })
  nombreMecanico: string | null;

  @ApiProperty({ type: String, nullable: true })
  motivoCancelacion: string | null;

  @ApiProperty({ type: [PortalLine] })
  detalles: PortalLine[];

  @ApiProperty({ type: PortalTotals })
  totales: PortalTotals;

  @ApiProperty({
    type: [PortalEvent],
    description: 'Solo los eventos públicos, del más antiguo al más nuevo',
  })
  eventos: PortalEvent[];

  @ApiProperty({
    type: [PortalQuote],
    description:
      'Las versiones del presupuesto, de la más nueva a la más vieja',
  })
  presupuestos: PortalQuote[];
}
