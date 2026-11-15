import { ApiProperty } from '@nestjs/swagger';
import type { Prisma } from '../../../../generated/prisma/client.js';
import {
  TipoDetalle,
  UnidadMedida,
} from '../../../../generated/prisma/enums.js';
import { itemSubtotal } from '../../work-orders/work-order-totals.js';

/** Lo que el portal necesita de un detalle de la orden o del presupuesto. */
export interface PortalLineModel {
  tipo: TipoDetalle;
  descripcion: string;
  cantidad: Prisma.Decimal;
  precioUnitario: Prisma.Decimal;
  producto?: { unidad: UnidadMedida } | null;
}

/**
 * Una línea (servicio o repuesto) como la ve el cliente: qué es, cuánto y a
 * qué precio. Nunca el costo ni los ids del catálogo.
 */
export class PortalLine {
  constructor(line: PortalLineModel) {
    this.tipo = line.tipo;
    this.descripcion = line.descripcion;
    this.cantidad = line.cantidad.toFixed(2);
    this.unidad = line.producto?.unidad ?? null;
    this.precioUnitario = line.precioUnitario.toFixed(2);
    this.subtotal = itemSubtotal(line).toFixed(2);
  }

  @ApiProperty({ enum: TipoDetalle, enumName: 'TipoDetalle' })
  tipo: TipoDetalle;

  @ApiProperty({ example: 'Cambio de aceite y filtro' })
  descripcion: string;

  @ApiProperty({ example: '1.00' })
  cantidad: string;

  @ApiProperty({
    enum: UnidadMedida,
    enumName: 'UnidadMedida',
    nullable: true,
    description: 'Solo en repuestos',
  })
  unidad: UnidadMedida | null;

  @ApiProperty({ example: '35.00' })
  precioUnitario: string;

  @ApiProperty({ example: '35.00' })
  subtotal: string;
}
