import { ApiProperty } from '@nestjs/swagger';
import type { LowStockProduct } from '../../../inventory/products/products.service.js';
import type { WorkOrderDashboardStats } from '../../work-orders/work-order-stats.js';
import { DashboardAttentionOrder } from './dashboard-attention-order.entity.js';
import { DashboardIndicators } from './dashboard-indicators.entity.js';
import { DashboardLowStockProduct } from './dashboard-low-stock-product.entity.js';
import { DashboardMechanicLoad } from './dashboard-mechanic-load.entity.js';
import { DashboardMonthTrend } from './dashboard-month-trend.entity.js';
import { DashboardServiceCount } from './dashboard-service-count.entity.js';
import { DashboardStatusCount } from './dashboard-status-count.entity.js';

/** Lo que el panel lee de los services dueños, antes de armar la respuesta. */
export type DashboardData = WorkOrderDashboardStats & {
  /** Solo para el administrador; `null` para el mecánico. */
  stockBajo: { total: number; productos: LowStockProduct[] } | null;
};

/**
 * El panel de inicio. Para el mecánico todo se limita a sus órdenes y lo del
 * administrador (montos, carga del equipo, servicios, stock) sale en `null`:
 * la clave está siempre, así Swagger y el frontend tipan un solo formato.
 */
export class Dashboard {
  constructor(data: DashboardData) {
    const admin = data.administracion;
    const stock = data.stockBajo;
    this.indicadores = new DashboardIndicators(
      data.indicadores,
      admin && stock
        ? { valorEntregadoMes: admin.valorEntregadoMes, stockBajo: stock.total }
        : null,
    );
    this.porEstado = data.porEstado.map((c) => new DashboardStatusCount(c));
    this.tendencia = data.tendencia.map((t) => new DashboardMonthTrend(t));
    this.cargaMecanicos =
      admin?.cargaMecanicos.map((l) => new DashboardMechanicLoad(l)) ?? null;
    this.serviciosTop =
      admin?.serviciosTop.map((s) => new DashboardServiceCount(s)) ?? null;
    this.atencion = data.atencion.map((o) => new DashboardAttentionOrder(o));
    this.productosStockBajo =
      stock?.productos.map((p) => new DashboardLowStockProduct(p)) ?? null;
  }

  @ApiProperty({ type: DashboardIndicators })
  indicadores: DashboardIndicators;

  @ApiProperty({
    type: [DashboardStatusCount],
    description:
      'Las órdenes abiertas por estado, en el orden del flujo y con los estados en 0',
  })
  porEstado: DashboardStatusCount[];

  @ApiProperty({
    type: [DashboardMonthTrend],
    description: 'Los últimos 6 meses de Lima, del más antiguo al actual',
  })
  tendencia: DashboardMonthTrend[];

  @ApiProperty({
    type: [DashboardMechanicLoad],
    nullable: true,
    description:
      'Solo para ADMINISTRADOR (null para el mecánico). Órdenes abiertas por mecánico, de la más cargada a la menos; las sin mecánico van en «Sin asignar»',
  })
  cargaMecanicos: DashboardMechanicLoad[] | null;

  @ApiProperty({
    type: [DashboardServiceCount],
    nullable: true,
    description:
      'Solo para ADMINISTRADOR (null para el mecánico). Los 5 servicios más agregados a órdenes recibidas en el mes (sin las canceladas)',
  })
  serviciosTop: DashboardServiceCount[] | null;

  @ApiProperty({
    type: [DashboardAttentionOrder],
    description:
      'Hasta 6 órdenes abiertas vencidas o que vencen en 2 días o menos, de la fecha prometida más antigua a la más nueva',
  })
  atencion: DashboardAttentionOrder[];

  @ApiProperty({
    type: [DashboardLowStockProduct],
    nullable: true,
    description:
      'Solo para ADMINISTRADOR (null para el mecánico). Hasta 6 productos activos con stock bajo, los que más les falta primero; el total está en indicadores.stockBajo',
  })
  productosStockBajo: DashboardLowStockProduct[] | null;
}
