import { ApiProperty } from '@nestjs/swagger';
import { EstadoOrden } from '../../../../generated/prisma/enums.js';
import type { StatusCount } from '../../work-orders/work-order-stats.js';

/** Cuántas órdenes abiertas hay en un estado. */
export class DashboardStatusCount {
  constructor(count: StatusCount) {
    this.estado = count.estado;
    this.cantidad = count.cantidad;
  }

  @ApiProperty({ enum: EstadoOrden, enumName: 'EstadoOrden' })
  estado: EstadoOrden;

  @ApiProperty({ example: 4 })
  cantidad: number;
}
