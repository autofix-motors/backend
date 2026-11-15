import { ApiProperty } from '@nestjs/swagger';
import type { Producto as ProductModel } from '../../../../generated/prisma/client.js';
import { UnidadMedida } from '../../../../generated/prisma/enums.js';

export type StockMovementProductModel = Pick<
  ProductModel,
  'productoId' | 'codigo' | 'nombre' | 'unidad'
>;

/**
 * El producto de un movimiento, resumido: lo justo para leer el kardex. La
 * unidad dice en qué se mide la cantidad.
 */
export class StockMovementProduct {
  constructor(product: StockMovementProductModel) {
    this.productoId = product.productoId;
    this.codigo = product.codigo;
    this.nombre = product.nombre;
    this.unidad = product.unidad;
  }

  @ApiProperty({ format: 'uuid' })
  productoId: string;

  @ApiProperty({ example: 'FA-TOY-90915' })
  codigo: string;

  @ApiProperty({ example: 'Filtro de aceite Toyota Yaris' })
  nombre: string;

  @ApiProperty({ enum: UnidadMedida, enumName: 'UnidadMedida' })
  unidad: UnidadMedida;
}
