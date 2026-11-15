import { ApiProperty } from '@nestjs/swagger';

export type BrandCount = { marca: string; cantidadVehiculos: number };

/** Una marca registrada y cuántos vehículos la tienen: las opciones del filtro. */
export class VehicleBrand {
  constructor({ marca, cantidadVehiculos }: BrandCount) {
    this.marca = marca;
    this.cantidadVehiculos = cantidadVehiculos;
  }

  @ApiProperty({ example: 'Toyota' })
  marca: string;

  @ApiProperty({ example: 12 })
  cantidadVehiculos: number;
}
