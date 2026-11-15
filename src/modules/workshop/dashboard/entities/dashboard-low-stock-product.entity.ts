import { ApiProperty } from '@nestjs/swagger';
import { UnidadMedida } from '../../../../generated/prisma/enums.js';
import type { LowStockProduct } from '../../../inventory/products/products.service.js';

/** Un producto activo con el stock en su mínimo o por debajo. */
export class DashboardLowStockProduct {
  constructor(product: LowStockProduct) {
    this.productoId = product.productoId;
    this.codigo = product.codigo;
    this.nombre = product.nombre;
    // Texto con dos decimales, como en el producto.
    this.stock = product.stock.toFixed(2);
    this.stockMinimo = product.stockMinimo.toFixed(2);
    this.unidad = product.unidad;
  }

  @ApiProperty({ format: 'uuid' })
  productoId: string;

  @ApiProperty({ example: 'FA-TOY-90915' })
  codigo: string;

  @ApiProperty({ example: 'Filtro de aceite Toyota Yaris' })
  nombre: string;

  @ApiProperty({ example: '1.00', description: 'En la unidad del producto' })
  stock: string;

  @ApiProperty({ example: '4.00', description: 'En la unidad del producto' })
  stockMinimo: string;

  @ApiProperty({ enum: UnidadMedida, enumName: 'UnidadMedida' })
  unidad: UnidadMedida;
}
