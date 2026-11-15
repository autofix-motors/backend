import { ApiProperty } from '@nestjs/swagger';
import type { Vehiculo as VehicleModel } from '../../../../generated/prisma/client.js';
import {
  VehicleCustomer,
  type VehicleCustomerModel,
} from './vehicle-customer.entity.js';

export type VehicleWithRelations = VehicleModel & {
  cliente: VehicleCustomerModel;
  _count: { ordenes: number };
};

/** Lo que sale de un vehículo por la API, con su dueño y cuántas órdenes tiene. */
export class Vehicle {
  constructor(vehicle: VehicleWithRelations) {
    this.vehiculoId = vehicle.vehiculoId;
    this.clienteId = vehicle.clienteId;
    this.cliente = new VehicleCustomer(vehicle.cliente);
    this.placa = vehicle.placa;
    this.marca = vehicle.marca;
    this.modelo = vehicle.modelo;
    this.anio = vehicle.anio;
    this.color = vehicle.color;
    this.vin = vehicle.vin;
    this.notas = vehicle.notas;
    this.cantidadOrdenes = vehicle._count.ordenes;
    this.creadoEn = vehicle.creadoEn;
    this.actualizadoEn = vehicle.actualizadoEn;
  }

  @ApiProperty({ format: 'uuid' })
  vehiculoId: string;

  @ApiProperty({ format: 'uuid' })
  clienteId: string;

  @ApiProperty({ type: VehicleCustomer })
  cliente: VehicleCustomer;

  @ApiProperty({ example: 'ABC123' })
  placa: string;

  @ApiProperty({ example: 'Toyota' })
  marca: string;

  @ApiProperty({ example: 'Yaris' })
  modelo: string;

  @ApiProperty({ type: Number, nullable: true, example: 2019 })
  anio: number | null;

  @ApiProperty({ type: String, nullable: true, example: 'Gris plata' })
  color: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'JTDBT923771234567' })
  vin: string | null;

  @ApiProperty({ type: String, nullable: true })
  notas: string | null;

  @ApiProperty({ example: 3 })
  cantidadOrdenes: number;

  @ApiProperty({ format: 'date-time' })
  creadoEn: Date;

  @ApiProperty({ format: 'date-time' })
  actualizadoEn: Date;
}
