import { ApiProperty } from '@nestjs/swagger';
import type { Vehicle as VehicleModel } from '../../../../generated/prisma/client.js';
import {
  VehicleCustomer,
  type VehicleCustomerModel,
} from './vehicle-customer.entity.js';

export type VehicleWithRelations = VehicleModel & {
  customer: VehicleCustomerModel;
  _count: { workOrders: number };
};

/** Lo que sale de un vehículo por la API, con su dueño y cuántas órdenes tiene. */
export class Vehicle {
  constructor(vehicle: VehicleWithRelations) {
    this.vehicleId = vehicle.vehicleId;
    this.customerId = vehicle.customerId;
    this.customer = new VehicleCustomer(vehicle.customer);
    this.plate = vehicle.plate;
    this.brand = vehicle.brand;
    this.model = vehicle.model;
    this.year = vehicle.year;
    this.color = vehicle.color;
    this.vin = vehicle.vin;
    this.notes = vehicle.notes;
    this.workOrdersCount = vehicle._count.workOrders;
    this.createdAt = vehicle.createdAt;
    this.updatedAt = vehicle.updatedAt;
  }

  @ApiProperty({ format: 'uuid' })
  vehicleId: string;

  @ApiProperty({ format: 'uuid' })
  customerId: string;

  @ApiProperty({ type: VehicleCustomer })
  customer: VehicleCustomer;

  @ApiProperty({ example: 'ABC123' })
  plate: string;

  @ApiProperty({ example: 'Toyota' })
  brand: string;

  @ApiProperty({ example: 'Yaris' })
  model: string;

  @ApiProperty({ type: Number, nullable: true, example: 2019 })
  year: number | null;

  @ApiProperty({ type: String, nullable: true, example: 'Gris plata' })
  color: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'JTDBT923771234567' })
  vin: string | null;

  @ApiProperty({ type: String, nullable: true })
  notes: string | null;

  @ApiProperty({ example: 3 })
  workOrdersCount: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}
