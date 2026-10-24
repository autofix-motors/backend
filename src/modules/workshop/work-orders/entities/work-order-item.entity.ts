import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { WorkOrderItem as WorkOrderItemModel } from '../../../../generated/prisma/client.js';
import { ItemType, UnitOfMeasure } from '../../../../generated/prisma/enums.js';
import { itemSubtotal } from '../work-order-totals.js';

/** El ítem como lo lee la orden: con la unidad del repuesto, si es uno. */
export type WorkOrderItemWithProduct = WorkOrderItemModel & {
  product: { unit: UnitOfMeasure } | null;
};

/**
 * Un servicio o repuesto de la orden. El costo solo sale para ADMIN, como el
 * del producto: el mecánico no ve costos ni márgenes (alcance del MVP), y para
 * él la clave no aparece en el JSON.
 */
export class WorkOrderItem {
  constructor(
    item: WorkOrderItemWithProduct,
    { includeCosts }: { includeCosts: boolean },
  ) {
    this.workOrderItemId = item.workOrderItemId;
    this.type = item.type;
    this.description = item.description;
    this.quantity = item.quantity.toFixed(2);
    this.unit = item.product?.unit ?? null;
    this.unitPrice = item.unitPrice.toFixed(2);
    this.subtotal = itemSubtotal(item).toFixed(2);
    if (includeCosts) this.unitCost = item.unitCost?.toFixed(2) ?? null;
    this.serviceCatalogItemId = item.serviceCatalogItemId;
    this.productId = item.productId;
    this.createdAt = item.createdAt;
  }

  @ApiProperty({ format: 'uuid' })
  workOrderItemId: string;

  @ApiProperty({ enum: ItemType, enumName: 'ItemType' })
  type: ItemType;

  @ApiProperty({
    example: 'FA-TOY-90915 · Filtro de aceite Toyota Yaris',
    description:
      'Copiada del servicio (su nombre) o del repuesto («código · nombre») al agregarlo',
  })
  description: string;

  @ApiProperty({
    example: '1.00',
    description:
      'En la unidad del repuesto; en un servicio, cuántas veces se hace',
  })
  quantity: string;

  @ApiProperty({
    enum: UnitOfMeasure,
    enumName: 'UnitOfMeasure',
    nullable: true,
    // Sin descripción: Swagger se la pondría al enum compartido con Product.
    // Es null en un servicio.
  })
  unit: UnitOfMeasure | null;

  @ApiProperty({ example: '35.00', description: 'En soles, congelado' })
  unitPrice: string;

  @ApiProperty({
    example: '35.00',
    description: 'Cantidad por precio unitario, redondeado a céntimos',
  })
  subtotal: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '18.50',
    description:
      'Solo para ADMIN. Costo del repuesto al consumirlo, en soles; null en un servicio',
  })
  unitCost?: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  serviceCatalogItemId: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  productId: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}
