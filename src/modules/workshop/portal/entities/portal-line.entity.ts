import { ApiProperty } from '@nestjs/swagger';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { ItemType, UnitOfMeasure } from '../../../../generated/prisma/enums.js';
import { itemSubtotal } from '../../work-orders/work-order-totals.js';

/** Lo que el portal necesita de un ítem de la orden o del presupuesto. */
export interface PortalLineModel {
  type: ItemType;
  description: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  product?: { unit: UnitOfMeasure } | null;
}

/**
 * Una línea (servicio o repuesto) como la ve el cliente: qué es, cuánto y a
 * qué precio. Nunca el costo ni los ids del catálogo.
 */
export class PortalLine {
  constructor(line: PortalLineModel) {
    this.type = line.type;
    this.description = line.description;
    this.quantity = line.quantity.toFixed(2);
    this.unit = line.product?.unit ?? null;
    this.unitPrice = line.unitPrice.toFixed(2);
    this.subtotal = itemSubtotal(line).toFixed(2);
  }

  @ApiProperty({ enum: ItemType, enumName: 'ItemType' })
  type: ItemType;

  @ApiProperty({ example: 'Cambio de aceite y filtro' })
  description: string;

  @ApiProperty({ example: '1.00' })
  quantity: string;

  @ApiProperty({
    enum: UnitOfMeasure,
    enumName: 'UnitOfMeasure',
    nullable: true,
    description: 'Solo en repuestos',
  })
  unit: UnitOfMeasure | null;

  @ApiProperty({ example: '35.00' })
  unitPrice: string;

  @ApiProperty({ example: '35.00' })
  subtotal: string;
}
