import { ApiProperty } from '@nestjs/swagger';
import type { Cliente as CustomerModel } from '../../../../generated/prisma/client.js';
import { TipoDocumento } from '../../../../generated/prisma/enums.js';

export type VehicleCustomerModel = Pick<
  CustomerModel,
  'clienteId' | 'nombre' | 'tipoDocumento' | 'numeroDocumento'
>;

/** El dueño de un vehículo, resumido: lo justo para mostrarlo en el listado. */
export class VehicleCustomer {
  constructor(customer: VehicleCustomerModel) {
    this.clienteId = customer.clienteId;
    this.nombre = customer.nombre;
    this.tipoDocumento = customer.tipoDocumento;
    this.numeroDocumento = customer.numeroDocumento;
  }

  @ApiProperty({ format: 'uuid' })
  clienteId: string;

  @ApiProperty({ example: 'Juan Pérez Rojas' })
  nombre: string;

  @ApiProperty({ enum: TipoDocumento, enumName: 'TipoDocumento' })
  tipoDocumento: TipoDocumento;

  @ApiProperty({ example: '45678912' })
  numeroDocumento: string;
}
