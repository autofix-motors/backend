import { ApiProperty } from '@nestjs/swagger';
import type { VehicleWithRelations } from '../../../customer/vehicles/entities/vehicle.entity.js';

/**
 * Un vehículo del cliente, como lo ve en su portal. Se copia campo por campo:
 * sin VIN, notas del taller ni datos del dueño (es él).
 */
export class PortalVehicle {
  constructor(vehiculo: VehicleWithRelations) {
    this.vehiculoId = vehiculo.vehiculoId;
    this.placa = vehiculo.placa;
    this.marca = vehiculo.marca;
    this.modelo = vehiculo.modelo;
    this.anio = vehiculo.anio;
    this.color = vehiculo.color;
    this.cantidadOrdenes = vehiculo._count.ordenes;
  }

  @ApiProperty({ format: 'uuid' })
  vehiculoId: string;

  @ApiProperty({ example: 'ABC123' })
  placa: string;

  @ApiProperty({ example: 'Toyota' })
  marca: string;

  @ApiProperty({ example: 'Yaris' })
  modelo: string;

  @ApiProperty({ type: Number, nullable: true, example: 2018 })
  anio: number | null;

  @ApiProperty({ type: String, nullable: true, example: 'Gris' })
  color: string | null;

  @ApiProperty({ example: 3, description: 'Órdenes registradas en el taller' })
  cantidadOrdenes: number;
}
