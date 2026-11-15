import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { DetalleOrden as WorkOrderItemModel } from '../../../../generated/prisma/client.js';
import {
  TipoDetalle,
  UnidadMedida,
} from '../../../../generated/prisma/enums.js';
import { itemSubtotal } from '../work-order-totals.js';

/** El detalle como lo lee la orden: con la unidad del repuesto, si es uno. */
export type WorkOrderItemWithProduct = WorkOrderItemModel & {
  producto: { unidad: UnidadMedida } | null;
};

/**
 * Un servicio o repuesto de la orden. El costo solo sale para ADMINISTRADOR, como el
 * del producto: el mecánico no ve costos ni márgenes (alcance del MVP), y para
 * él la clave no aparece en el JSON.
 */
export class WorkOrderItem {
  constructor(
    item: WorkOrderItemWithProduct,
    { incluirCostos }: { incluirCostos: boolean },
  ) {
    this.detalleOrdenId = item.detalleOrdenId;
    this.tipo = item.tipo;
    this.descripcion = item.descripcion;
    this.cantidad = item.cantidad.toFixed(2);
    this.unidad = item.producto?.unidad ?? null;
    this.precioUnitario = item.precioUnitario.toFixed(2);
    this.subtotal = itemSubtotal(item).toFixed(2);
    if (incluirCostos)
      this.costoUnitario = item.costoUnitario?.toFixed(2) ?? null;
    this.servicioId = item.servicioId;
    this.productoId = item.productoId;
    this.creadoEn = item.creadoEn;
  }

  @ApiProperty({ format: 'uuid' })
  detalleOrdenId: string;

  @ApiProperty({ enum: TipoDetalle, enumName: 'TipoDetalle' })
  tipo: TipoDetalle;

  @ApiProperty({
    example: 'FA-TOY-90915 · Filtro de aceite Toyota Yaris',
    description:
      'Copiada del servicio (su nombre) o del repuesto («código · nombre») al agregarlo',
  })
  descripcion: string;

  @ApiProperty({
    example: '1.00',
    description:
      'En la unidad del repuesto; en un servicio, cuántas veces se hace',
  })
  cantidad: string;

  @ApiProperty({
    enum: UnidadMedida,
    enumName: 'UnidadMedida',
    nullable: true,
    // Sin descripción: Swagger se la pondría al enum compartido con Producto.
    // Es null en un servicio.
  })
  unidad: UnidadMedida | null;

  @ApiProperty({ example: '35.00', description: 'En soles, congelado' })
  precioUnitario: string;

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
      'Solo para ADMINISTRADOR. Costo del repuesto al consumirlo, en soles; null en un servicio',
  })
  costoUnitario?: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  servicioId: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  productoId: string | null;

  @ApiProperty({ format: 'date-time' })
  creadoEn: Date;
}
