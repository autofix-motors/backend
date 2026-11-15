import { ApiProperty } from '@nestjs/swagger';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { WorkOrderDashboardStats } from '../../work-orders/work-order-stats.js';

/**
 * Los contadores de la cabecera del panel. Los dos últimos son del
 * administrador: para el mecánico van en `null` (la clave sale igual, para que
 * el frontend tipe un solo formato).
 */
export class DashboardIndicators {
  constructor(
    indicadores: WorkOrderDashboardStats['indicadores'],
    administracion: {
      valorEntregadoMes: Prisma.Decimal;
      stockBajo: number;
    } | null,
  ) {
    this.abiertas = indicadores.abiertas;
    this.esperandoAprobacion = indicadores.esperandoAprobacion;
    this.listas = indicadores.listas;
    this.vencidas = indicadores.vencidas;
    this.entregadasMes = indicadores.entregadasMes;
    // Texto con dos decimales, como los totales de la orden.
    this.valorEntregadoMes =
      administracion?.valorEntregadoMes.toFixed(2) ?? null;
    this.stockBajo = administracion?.stockBajo ?? null;
  }

  @ApiProperty({ example: 14, description: 'Órdenes sin entregar ni cancelar' })
  abiertas: number;

  @ApiProperty({
    example: 3,
    description: 'Abiertas esperando que el cliente apruebe el presupuesto',
  })
  esperandoAprobacion: number;

  @ApiProperty({ example: 2, description: 'Listas para recoger' })
  listas: number;

  @ApiProperty({
    example: 1,
    description:
      'Abiertas con la fecha prometida ya pasada (en Lima): la misma regla que el filtro `vencidas` del listado',
  })
  vencidas: number;

  @ApiProperty({
    example: 22,
    description: 'Entregadas en el mes actual de Lima',
  })
  entregadasMes: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '8450.50',
    description:
      'Solo para ADMINISTRADOR (null para el mecánico). Lo cobrado en las órdenes entregadas en el mes, en soles',
  })
  valorEntregadoMes: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 4,
    description:
      'Solo para ADMINISTRADOR (null para el mecánico). Productos activos con stock en su mínimo o por debajo',
  })
  stockBajo: number | null;
}
