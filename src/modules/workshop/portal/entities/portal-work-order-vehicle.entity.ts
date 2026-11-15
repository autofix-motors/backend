import { ApiProperty } from '@nestjs/swagger';
import type { WorkOrderVehicleModel } from '../../work-orders/entities/work-order-vehicle.entity.js';

/** El vehículo de una orden, resumido, para el portal. */
export class PortalWorkOrderVehicle {
  constructor(vehiculo: WorkOrderVehicleModel) {
    this.vehiculoId = vehiculo.vehiculoId;
    this.placa = vehiculo.placa;
    this.marca = vehiculo.marca;
    this.modelo = vehiculo.modelo;
  }

  @ApiProperty({ format: 'uuid' })
  vehiculoId: string;

  @ApiProperty({ example: 'ABC123' })
  placa: string;

  @ApiProperty({ example: 'Toyota' })
  marca: string;

  @ApiProperty({ example: 'Yaris' })
  modelo: string;
}
