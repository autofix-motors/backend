import { ApiProperty } from '@nestjs/swagger';
import type { MonthTrend } from '../../work-orders/work-order-stats.js';

/** Las órdenes recibidas y entregadas en un mes de Lima. */
export class DashboardMonthTrend {
  constructor(trend: MonthTrend) {
    this.mes = trend.mes;
    this.recibidas = trend.recibidas;
    this.entregadas = trend.entregadas;
  }

  @ApiProperty({ example: '2026-11', description: 'Mes de Lima, AAAA-MM' })
  mes: string;

  @ApiProperty({ example: 25, description: 'Por su fecha de recepción' })
  recibidas: number;

  @ApiProperty({ example: 22, description: 'Por su fecha de entrega' })
  entregadas: number;
}
