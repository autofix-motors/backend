import { ApiProperty } from '@nestjs/swagger';
import type { Vehiculo as VehicleModel } from '../../../../generated/prisma/client.js';

export type WorkOrderVehicleModel = Pick<
  VehicleModel,
  'vehiculoId' | 'placa' | 'marca' | 'modelo'
>;

/** El vehículo de una orden, resumido: lo que se ve en el listado. */
export class WorkOrderVehicle {
  constructor(vehiculo: WorkOrderVehicleModel) {
    this.vehiculoId = vehiculo.vehiculoId;
    this.placa = vehiculo.placa;
    this.marca = vehiculo.marca;
    this.modelo = vehiculo.modelo;
  }

  @ApiProperty({ format: 'uuid' })
  vehiculoId: string;

  @ApiProperty({ example: 'ABK582' })
  placa: string;

  @ApiProperty({ example: 'Toyota' })
  marca: string;

  @ApiProperty({ example: 'Yaris' })
  modelo: string;
}
