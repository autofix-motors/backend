import { ApiProperty } from '@nestjs/swagger';
import type { VehicleWithRelations } from '../../../customer/vehicles/entities/vehicle.entity.js';

/**
 * Un vehículo del cliente, como lo ve en su portal. Se copia campo por campo:
 * sin VIN, notas del taller ni datos del dueño (es él).
 */
export class PortalVehicle {
  constructor(vehicle: VehicleWithRelations) {
    this.vehicleId = vehicle.vehicleId;
    this.plate = vehicle.plate;
    this.brand = vehicle.brand;
    this.model = vehicle.model;
    this.year = vehicle.year;
    this.color = vehicle.color;
    this.workOrdersCount = vehicle._count.workOrders;
  }

  @ApiProperty({ format: 'uuid' })
  vehicleId: string;

  @ApiProperty({ example: 'ABC123' })
  plate: string;

  @ApiProperty({ example: 'Toyota' })
  brand: string;

  @ApiProperty({ example: 'Yaris' })
  model: string;

  @ApiProperty({ type: Number, nullable: true, example: 2018 })
  year: number | null;

  @ApiProperty({ type: String, nullable: true, example: 'Gris' })
  color: string | null;

  @ApiProperty({ example: 3, description: 'Órdenes registradas en el taller' })
  workOrdersCount: number;
}
