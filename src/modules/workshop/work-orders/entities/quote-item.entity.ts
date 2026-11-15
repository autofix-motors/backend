import { ApiProperty } from '@nestjs/swagger';
import type { DetallePresupuesto as QuoteItemModel } from '../../../../generated/prisma/client.js';
import { TipoDetalle } from '../../../../generated/prisma/enums.js';
import { itemSubtotal } from '../work-order-totals.js';

/**
 * Una línea del presupuesto, como se envió: la foto de un detalle de la orden.
 * Nunca lleva costos (la foto no los guarda), así que es igual para el
 * administrador y el mecánico.
 */
export class QuoteItem {
  constructor(item: QuoteItemModel) {
    this.detallePresupuestoId = item.detallePresupuestoId;
    this.tipo = item.tipo;
    this.descripcion = item.descripcion;
    this.cantidad = item.cantidad.toFixed(2);
    this.precioUnitario = item.precioUnitario.toFixed(2);
    // El mismo cálculo que el detalle de la orden: el total del presupuesto es
    // la suma de estos subtotales.
    this.subtotal = itemSubtotal(item).toFixed(2);
  }

  @ApiProperty({ format: 'uuid' })
  detallePresupuestoId: string;

  @ApiProperty({ enum: TipoDetalle, enumName: 'TipoDetalle' })
  tipo: TipoDetalle;

  @ApiProperty({ example: 'FA-TOY-90915 · Filtro de aceite Toyota Yaris' })
  descripcion: string;

  @ApiProperty({ example: '1.00' })
  cantidad: string;

  @ApiProperty({ example: '35.00', description: 'En soles' })
  precioUnitario: string;

  @ApiProperty({
    example: '35.00',
    description: 'Cantidad por precio unitario, redondeado a céntimos',
  })
  subtotal: string;
}
