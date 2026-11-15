import { ApiProperty } from '@nestjs/swagger';
import { EstadoOrden } from '../../../../generated/prisma/enums.js';
import type { AttentionOrder } from '../../work-orders/work-order-stats.js';

/** Una orden abierta vencida o a punto de vencer. */
export class DashboardAttentionOrder {
  constructor(order: AttentionOrder) {
    this.ordenTrabajoId = order.ordenTrabajoId;
    this.numero = order.numero;
    this.placa = order.placa;
    this.estado = order.estado;
    this.fechaPrometida = order.fechaPrometida;
    this.vencida = order.vencida;
  }

  @ApiProperty({ format: 'uuid' })
  ordenTrabajoId: string;

  @ApiProperty({
    example: 123,
    description: 'Correlativo; se muestra como OT-000123',
  })
  numero: number;

  @ApiProperty({ example: 'ABK582' })
  placa: string;

  @ApiProperty({ enum: EstadoOrden, enumName: 'EstadoOrden' })
  estado: EstadoOrden;

  @ApiProperty({ type: String, format: 'date', example: '2026-11-16' })
  fechaPrometida: string;

  @ApiProperty({
    description: 'La fecha prometida ya pasó; si no, vence en 2 días o menos',
  })
  vencida: boolean;
}
