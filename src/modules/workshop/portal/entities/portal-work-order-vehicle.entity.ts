import { ApiProperty } from '@nestjs/swagger';
import type { WorkOrderVehicleModel } from '../../work-orders/entities/work-order-vehicle.entity.js';

/** El vehículo de una orden, resumido, para el portal. */
export class PortalWorkOrderVehicle {
  constructor(vehicle: WorkOrderVehicleModel) {
    this.vehicleId = vehicle.vehicleId;
    this.plate = vehicle.plate;
    this.brand = vehicle.brand;
    this.model = vehicle.model;
  }

  @ApiProperty({ format: 'uuid' })
  vehicleId: string;

  @ApiProperty({ example: 'ABC123' })
  plate: string;

  @ApiProperty({ example: 'Toyota' })
  brand: string;

  @ApiProperty({ example: 'Yaris' })
  model: string;
}
