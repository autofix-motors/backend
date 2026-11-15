import { ApiProperty } from '@nestjs/swagger';
import type { OrdenTrabajo as WorkOrderModel } from '../../../../generated/prisma/client.js';
import { EstadoOrden } from '../../../../generated/prisma/enums.js';
import { fromDateColumn } from '../../../../shared/date-column.js';
import { limaToday } from '../../../../shared/lima-dates.js';
import { isOverdue } from '../work-order-status.js';
import { type TotaledItem, workOrderAmounts } from '../work-order-totals.js';
import {
  WorkOrderCustomer,
  type WorkOrderCustomerModel,
} from './work-order-customer.entity.js';
import {
  WorkOrderUser,
  type WorkOrderUserModel,
} from './work-order-user.entity.js';
import {
  WorkOrderVehicle,
  type WorkOrderVehicleModel,
} from './work-order-vehicle.entity.js';

export type WorkOrderWithRelations = WorkOrderModel & {
  vehiculo: WorkOrderVehicleModel;
  cliente: WorkOrderCustomerModel;
  mecanico: WorkOrderUserModel | null;
  /** Solo lo que hace falta para el total: tipo, cantidad y precio. */
  detalles: TotaledItem[];
};

/**
 * Lo que sale de una orden en el listado: sus datos de ingreso, el vehículo,
 * el cliente y el mecánico resumidos, si está vencida y su total.
 */
export class WorkOrder {
  constructor(order: WorkOrderWithRelations, today: string = limaToday()) {
    this.ordenTrabajoId = order.ordenTrabajoId;
    this.numero = order.numero;
    this.codigoSeguimiento = order.codigoSeguimiento;
    this.estado = order.estado;
    this.kilometrajeIngreso = order.kilometrajeIngreso;
    this.motivo = order.motivo;
    this.fechaPrometida =
      order.fechaPrometida && fromDateColumn(order.fechaPrometida);
    this.recibidaEn = order.recibidaEn;
    this.entregadaEn = order.entregadaEn;
    this.vencida = isOverdue(order.estado, this.fechaPrometida, today);
    this.vehiculo = new WorkOrderVehicle(order.vehiculo);
    this.cliente = new WorkOrderCustomer(order.cliente);
    this.mecanico = order.mecanico && new WorkOrderUser(order.mecanico);
    this.total = workOrderAmounts(order.detalles).total.toFixed(2);
  }

  @ApiProperty({ format: 'uuid' })
  ordenTrabajoId: string;

  @ApiProperty({
    example: 123,
    description: 'Correlativo; se muestra como OT-000123',
  })
  numero: number;

  @ApiProperty({ example: 'AFM-7K3Q9X' })
  codigoSeguimiento: string;

  @ApiProperty({ enum: EstadoOrden, enumName: 'EstadoOrden' })
  estado: EstadoOrden;

  @ApiProperty({ example: 84500, description: 'Kilometraje al ingreso, en km' })
  kilometrajeIngreso: number;

  @ApiProperty({ example: 'Ruido al frenar y vibración en el timón' })
  motivo: string;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-10-08',
  })
  fechaPrometida: string | null;

  @ApiProperty({ format: 'date-time' })
  recibidaEn: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  entregadaEn: Date | null;

  @ApiProperty({
    description:
      'La fecha prometida ya pasó (en Lima) y no se entregó ni se canceló',
  })
  vencida: boolean;

  @ApiProperty({ type: WorkOrderVehicle })
  vehiculo: WorkOrderVehicle;

  @ApiProperty({ type: WorkOrderCustomer })
  cliente: WorkOrderCustomer;

  @ApiProperty({ type: WorkOrderUser, nullable: true })
  mecanico: WorkOrderUser | null;

  @ApiProperty({
    example: '275.50',
    description: 'La suma de sus servicios y repuestos, en soles',
  })
  total: string;
}
