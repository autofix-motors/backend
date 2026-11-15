import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Producto as ProductModel } from '../../../../generated/prisma/client.js';
import {
  TipoProducto,
  UnidadMedida,
} from '../../../../generated/prisma/enums.js';

/**
 * Lo que sale de un repuesto o insumo por la API.
 *
 * El mecánico no ve costos ni márgenes (alcance del MVP): `costo` y `margen`
 * solo se copian con `incluirCostos`, que el controller enciende para
 * `ADMINISTRADOR`. Para el mecánico las dos claves no aparecen en el JSON. Es
 * una sola clase y no dos porque es el mismo producto en el mismo endpoint: con
 * dos, Swagger y los tipos del frontend tendrían que distinguir dos respuestas
 * según quién pregunta.
 */
export class Product {
  constructor(
    product: ProductModel,
    { incluirCostos }: { incluirCostos: boolean },
  ) {
    this.productoId = product.productoId;
    this.codigo = product.codigo;
    this.nombre = product.nombre;
    this.tipo = product.tipo;
    this.unidad = product.unidad;
    this.marca = product.marca;
    // Texto con dos decimales: serializado sin más, 4.50 viajaría como «4.5».
    this.stock = product.stock.toFixed(2);
    this.stockMinimo = product.stockMinimo.toFixed(2);
    this.stockBajo = product.stock.lte(product.stockMinimo);
    this.precio = product.precio.toFixed(2);
    if (incluirCostos) {
      this.costo = product.costo.toFixed(2);
      this.margen = product.precio.minus(product.costo).toFixed(2);
    }
    this.activo = product.activo;
    this.creadoEn = product.creadoEn;
    this.actualizadoEn = product.actualizadoEn;
  }

  @ApiProperty({ format: 'uuid' })
  productoId: string;

  @ApiProperty({ example: 'FA-TOY-90915' })
  codigo: string;

  @ApiProperty({ example: 'Filtro de aceite Toyota Yaris' })
  nombre: string;

  @ApiProperty({ enum: TipoProducto, enumName: 'TipoProducto' })
  tipo: TipoProducto;

  @ApiProperty({ enum: UnidadMedida, enumName: 'UnidadMedida' })
  unidad: UnidadMedida;

  @ApiProperty({ type: String, nullable: true, example: 'Toyota' })
  marca: string | null;

  @ApiProperty({
    example: '12.00',
    description:
      'En la unidad del producto. Solo lo cambian los movimientos de stock',
  })
  stock: string;

  @ApiProperty({ example: '4.00', description: 'En la unidad del producto' })
  stockMinimo: string;

  @ApiProperty({
    description: 'El stock está en el mínimo o debajo (stock <= stockMinimo)',
  })
  stockBajo: boolean;

  @ApiPropertyOptional({
    example: '18.50',
    description: 'Último costo de compra, en soles. Solo para ADMINISTRADOR',
  })
  costo?: string;

  @ApiProperty({ example: '30.00', description: 'Precio de venta, en soles' })
  precio: string;

  @ApiPropertyOptional({
    example: '11.50',
    description:
      'Precio menos costo, en soles; negativo si se vende por debajo del costo. Solo para ADMINISTRADOR',
  })
  margen?: string;

  @ApiProperty()
  activo: boolean;

  @ApiProperty({ format: 'date-time' })
  creadoEn: Date;

  @ApiProperty({ format: 'date-time' })
  actualizadoEn: Date;
}
