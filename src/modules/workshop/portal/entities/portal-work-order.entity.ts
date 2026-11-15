import { ApiProperty } from '@nestjs/swagger';
import {
  EstadoPresupuesto,
  EstadoOrden,
} from '../../../../generated/prisma/enums.js';
import { fromDateColumn } from '../../../../shared/date-column.js';
import type { WorkOrderWithRelations } from '../../work-orders/entities/work-order.entity.js';
import { workOrderAmounts } from '../../work-orders/work-order-totals.js';
import { PortalWorkOrderVehicle } from './portal-work-order-vehicle.entity.js';

/** Lo que trae una orden para el listado del portal. */
export type PortalWorkOrderModel = Omit<WorkOrderWithRelations, 'detalles'> & {
  detalles: WorkOrderWithRelations['detalles'];
  presupuestos: { presupuestoId: string; estado?: EstadoPresupuesto }[];
};

/**
 * Una orden del cliente en su portal. Se copia campo por campo: sin el número
 * correlativo del taller, sin datos del personal y sin costos. El código de
 * seguimiento es la referencia que el cliente conoce.
 */
export class PortalWorkOrder {
  constructor(order: PortalWorkOrderModel) {
    this.ordenTrabajoId = order.ordenTrabajoId;
    this.codigoSeguimiento = order.codigoSeguimiento;
    this.estado = order.estado;
    this.motivo = order.motivo;
    this.vehiculo = new PortalWorkOrderVehicle(order.vehiculo);
    this.recibidaEn = order.recibidaEn;
    this.fechaPrometida =
      order.fechaPrometida && fromDateColumn(order.fechaPrometida);
    this.entregadaEn = order.entregadaEn;
    this.total = workOrderAmounts(order.detalles).total.toFixed(2);
    // Solo cuenta mientras la orden espera: una versión que quedó pendiente
    // en una orden cancelada ya no se responde.
    this.tienePresupuestoPendiente =
      order.estado === EstadoOrden.ESPERANDO_APROBACION &&
      order.presupuestos.some(
        (presupuesto) =>
          (presupuesto.estado ?? EstadoPresupuesto.PENDIENTE) ===
          EstadoPresupuesto.PENDIENTE,
      );
  }

  @ApiProperty({ format: 'uuid' })
  ordenTrabajoId: string;

  @ApiProperty({ example: 'AFM-7K3Q9X', description: 'Código de seguimiento' })
  codigoSeguimiento: string;

  @ApiProperty({ enum: EstadoOrden, enumName: 'EstadoOrden' })
  estado: EstadoOrden;

  @ApiProperty({ example: 'Ruido al frenar' })
  motivo: string;

  @ApiProperty({ type: PortalWorkOrderVehicle })
  vehiculo: PortalWorkOrderVehicle;

  @ApiProperty({ format: 'date-time' })
  recibidaEn: Date;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-10-20',
  })
  fechaPrometida: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  entregadaEn: Date | null;

  @ApiProperty({ example: '450.00', description: 'En soles' })
  total: string;

  @ApiProperty({
    description: 'Hay un presupuesto esperando su respuesta',
  })
  tienePresupuestoPendiente: boolean;
}
