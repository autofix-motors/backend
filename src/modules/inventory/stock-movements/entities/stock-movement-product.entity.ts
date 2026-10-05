import { ApiProperty } from '@nestjs/swagger';
import type { Product as ProductModel } from '../../../../generated/prisma/client.js';
import { UnitOfMeasure } from '../../../../generated/prisma/enums.js';

export type StockMovementProductModel = Pick<
  ProductModel,
  'productId' | 'code' | 'name' | 'unit'
>;

/**
 * El producto de un movimiento, resumido: lo justo para leer el kardex. La
 * unidad dice en qué se mide la cantidad.
 */
export class StockMovementProduct {
  constructor(product: StockMovementProductModel) {
    this.productId = product.productId;
    this.code = product.code;
    this.name = product.name;
    this.unit = product.unit;
  }

  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty({ example: 'FA-TOY-90915' })
  code: string;

  @ApiProperty({ example: 'Filtro de aceite Toyota Yaris' })
  name: string;

  @ApiProperty({ enum: UnitOfMeasure, enumName: 'UnitOfMeasure' })
  unit: UnitOfMeasure;
}
