import { ApiProperty } from '@nestjs/swagger';
import type { WorkOrder as WorkOrderModel } from '../../../../generated/prisma/client.js';
import { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
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
  vehicle: WorkOrderVehicleModel;
  customer: WorkOrderCustomerModel;
  mechanic: WorkOrderUserModel | null;
  /** Solo lo que hace falta para el total: tipo, cantidad y precio. */
  items: TotaledItem[];
};

/**
 * Lo que sale de una orden en el listado: sus datos de ingreso, el vehículo,
 * el cliente y el mecánico resumidos, si está vencida y su total.
 */
export class WorkOrder {
  constructor(order: WorkOrderWithRelations, today: string = limaToday()) {
    this.workOrderId = order.workOrderId;
    this.number = order.number;
    this.trackingCode = order.trackingCode;
    this.status = order.status;
    this.mileageIn = order.mileageIn;
    this.reason = order.reason;
    this.promisedDate =
      order.promisedDate && fromDateColumn(order.promisedDate);
    this.receivedAt = order.receivedAt;
    this.deliveredAt = order.deliveredAt;
    this.isOverdue = isOverdue(order.status, this.promisedDate, today);
    this.vehicle = new WorkOrderVehicle(order.vehicle);
    this.customer = new WorkOrderCustomer(order.customer);
    this.mechanic = order.mechanic && new WorkOrderUser(order.mechanic);
    this.total = workOrderAmounts(order.items).total.toFixed(2);
  }

  @ApiProperty({ format: 'uuid' })
  workOrderId: string;

  @ApiProperty({
    example: 123,
    description: 'Correlativo; se muestra como OT-000123',
  })
  number: number;

  @ApiProperty({ example: 'AFM-7K3Q9X' })
  trackingCode: string;

  @ApiProperty({ enum: WorkOrderStatus, enumName: 'WorkOrderStatus' })
  status: WorkOrderStatus;

  @ApiProperty({ example: 84500, description: 'Kilometraje al ingreso, en km' })
  mileageIn: number;

  @ApiProperty({ example: 'Ruido al frenar y vibración en el timón' })
  reason: string;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-10-08',
  })
  promisedDate: string | null;

  @ApiProperty({ format: 'date-time' })
  receivedAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deliveredAt: Date | null;

  @ApiProperty({
    description:
      'La fecha prometida ya pasó (en Lima) y no se entregó ni se canceló',
  })
  isOverdue: boolean;

  @ApiProperty({ type: WorkOrderVehicle })
  vehicle: WorkOrderVehicle;

  @ApiProperty({ type: WorkOrderCustomer })
  customer: WorkOrderCustomer;

  @ApiProperty({ type: WorkOrderUser, nullable: true })
  mechanic: WorkOrderUser | null;

  @ApiProperty({
    example: '275.50',
    description: 'La suma de sus servicios y repuestos, en soles',
  })
  total: string;
}
