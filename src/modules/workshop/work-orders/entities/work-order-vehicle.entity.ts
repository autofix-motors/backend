import { ApiProperty } from '@nestjs/swagger';
import type { Vehicle as VehicleModel } from '../../../../generated/prisma/client.js';

export type WorkOrderVehicleModel = Pick<
  VehicleModel,
  'vehicleId' | 'plate' | 'brand' | 'model'
>;

/** El vehículo de una orden, resumido: lo que se ve en el listado. */
export class WorkOrderVehicle {
  constructor(vehicle: WorkOrderVehicleModel) {
    this.vehicleId = vehicle.vehicleId;
    this.plate = vehicle.plate;
    this.brand = vehicle.brand;
    this.model = vehicle.model;
  }

  @ApiProperty({ format: 'uuid' })
  vehicleId: string;

  @ApiProperty({ example: 'ABK582' })
  plate: string;

  @ApiProperty({ example: 'Toyota' })
  brand: string;

  @ApiProperty({ example: 'Yaris' })
  model: string;
}
