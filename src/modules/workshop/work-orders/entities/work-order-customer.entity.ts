import { ApiProperty } from '@nestjs/swagger';
import type { Cliente as CustomerModel } from '../../../../generated/prisma/client.js';

export type WorkOrderCustomerModel = Pick<
  CustomerModel,
  'clienteId' | 'nombre' | 'telefono'
>;

/**
 * El cliente de una orden (el que se congeló al recibir el vehículo), con el
 * teléfono para avisarle que su vehículo está listo.
 */
export class WorkOrderCustomer {
  constructor(cliente: WorkOrderCustomerModel) {
    this.clienteId = cliente.clienteId;
    this.nombre = cliente.nombre;
    this.telefono = cliente.telefono;
  }

  @ApiProperty({ format: 'uuid' })
  clienteId: string;

  @ApiProperty({ example: 'Juan Pérez Rojas' })
  nombre: string;

  @ApiProperty({ example: '987654321' })
  telefono: string;
}
