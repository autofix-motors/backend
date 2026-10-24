import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Product as ProductModel } from '../../../../generated/prisma/client.js';
import {
  ProductKind,
  UnitOfMeasure,
} from '../../../../generated/prisma/enums.js';

/**
 * Lo que sale de un repuesto o insumo por la API.
 *
 * El mecánico no ve costos ni márgenes (alcance del MVP): `cost` y `margin`
 * solo se copian con `includeCosts`, que el controller enciende para `ADMIN`.
 * Para el mecánico las dos claves no aparecen en el JSON. Es una sola clase y
 * no dos porque es el mismo producto en el mismo endpoint: con dos, Swagger y
 * los tipos del frontend tendrían que distinguir dos respuestas según quién
 * pregunta.
 */
export class Product {
  constructor(
    product: ProductModel,
    { includeCosts }: { includeCosts: boolean },
  ) {
    this.productId = product.productId;
    this.code = product.code;
    this.name = product.name;
    this.kind = product.kind;
    this.unit = product.unit;
    this.brand = product.brand;
    // Texto con dos decimales: serializado sin más, 4.50 viajaría como «4.5».
    this.stock = product.stock.toFixed(2);
    this.minStock = product.minStock.toFixed(2);
    this.isLowStock = product.stock.lte(product.minStock);
    this.price = product.price.toFixed(2);
    if (includeCosts) {
      this.cost = product.cost.toFixed(2);
      this.margin = product.price.minus(product.cost).toFixed(2);
    }
    this.isActive = product.isActive;
    this.createdAt = product.createdAt;
    this.updatedAt = product.updatedAt;
  }

  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty({ example: 'FA-TOY-90915' })
  code: string;

  @ApiProperty({ example: 'Filtro de aceite Toyota Yaris' })
  name: string;

  @ApiProperty({ enum: ProductKind, enumName: 'ProductKind' })
  kind: ProductKind;

  @ApiProperty({ enum: UnitOfMeasure, enumName: 'UnitOfMeasure' })
  unit: UnitOfMeasure;

  @ApiProperty({ type: String, nullable: true, example: 'Toyota' })
  brand: string | null;

  @ApiProperty({
    example: '12.00',
    description:
      'En la unidad del producto. Solo lo cambian los movimientos de stock',
  })
  stock: string;

  @ApiProperty({ example: '4.00', description: 'En la unidad del producto' })
  minStock: string;

  @ApiProperty({
    description: 'El stock está en el mínimo o debajo (stock <= minStock)',
  })
  isLowStock: boolean;

  @ApiPropertyOptional({
    example: '18.50',
    description: 'Último costo de compra, en soles. Solo para ADMIN',
  })
  cost?: string;

  @ApiProperty({ example: '30.00', description: 'Precio de venta, en soles' })
  price: string;

  @ApiPropertyOptional({
    example: '11.50',
    description:
      'Precio menos costo, en soles; negativo si se vende por debajo del costo. Solo para ADMIN',
  })
  margin?: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}
