import { ApiProperty } from '@nestjs/swagger';

export type BrandCount = { brand: string; vehiclesCount: number };

/** Una marca registrada y cuántos vehículos la tienen: las opciones del filtro. */
export class VehicleBrand {
  constructor({ brand, vehiclesCount }: BrandCount) {
    this.brand = brand;
    this.vehiclesCount = vehiclesCount;
  }

  @ApiProperty({ example: 'Toyota' })
  brand: string;

  @ApiProperty({ example: 12 })
  vehiclesCount: number;
}
