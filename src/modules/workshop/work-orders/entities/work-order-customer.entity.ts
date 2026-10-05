import { ApiProperty } from '@nestjs/swagger';
import type { Customer as CustomerModel } from '../../../../generated/prisma/client.js';

export type WorkOrderCustomerModel = Pick<
  CustomerModel,
  'customerId' | 'name' | 'phone'
>;

/**
 * El cliente de una orden (el que se congeló al recibir el vehículo), con el
 * teléfono para avisarle que su vehículo está listo.
 */
export class WorkOrderCustomer {
  constructor(customer: WorkOrderCustomerModel) {
    this.customerId = customer.customerId;
    this.name = customer.name;
    this.phone = customer.phone;
  }

  @ApiProperty({ format: 'uuid' })
  customerId: string;

  @ApiProperty({ example: 'Juan Pérez Rojas' })
  name: string;

  @ApiProperty({ example: '987654321' })
  phone: string;
}
