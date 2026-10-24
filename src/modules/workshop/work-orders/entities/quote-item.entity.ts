import { ApiProperty } from '@nestjs/swagger';
import type { QuoteItem as QuoteItemModel } from '../../../../generated/prisma/client.js';
import { ItemType } from '../../../../generated/prisma/enums.js';
import { itemSubtotal } from '../work-order-totals.js';

/**
 * Una línea del presupuesto, como se envió: la foto de un ítem de la orden.
 * Nunca lleva costos (la foto no los guarda), así que es igual para el
 * administrador y el mecánico.
 */
export class QuoteItem {
  constructor(item: QuoteItemModel) {
    this.quoteItemId = item.quoteItemId;
    this.type = item.type;
    this.description = item.description;
    this.quantity = item.quantity.toFixed(2);
    this.unitPrice = item.unitPrice.toFixed(2);
    // El mismo cálculo que el ítem de la orden: el total del presupuesto es
    // la suma de estos subtotales.
    this.subtotal = itemSubtotal(item).toFixed(2);
  }

  @ApiProperty({ format: 'uuid' })
  quoteItemId: string;

  @ApiProperty({ enum: ItemType, enumName: 'ItemType' })
  type: ItemType;

  @ApiProperty({ example: 'FA-TOY-90915 · Filtro de aceite Toyota Yaris' })
  description: string;

  @ApiProperty({ example: '1.00' })
  quantity: string;

  @ApiProperty({ example: '35.00', description: 'En soles' })
  unitPrice: string;

  @ApiProperty({
    example: '35.00',
    description: 'Cantidad por precio unitario, redondeado a céntimos',
  })
  subtotal: string;
}
