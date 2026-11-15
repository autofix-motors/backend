import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../core/auth/session-user.js';
import { RolUsuario } from '../../../generated/prisma/enums.js';
import { ProductsService } from '../../inventory/products/products.service.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { Dashboard } from './entities/dashboard.entity.js';

/** Cuántos productos con stock bajo salen en el panel. */
export const LOW_STOCK_LIMIT = 6;

/**
 * El panel de inicio. No tiene tablas propias: las órdenes y los productos se
 * leen con sus services dueños (invariante 3).
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly workOrders: WorkOrdersService,
    private readonly products: ProductsService,
  ) {}

  /**
   * El mecánico ve solo sus órdenes y nada de lo administrativo; el filtro sale
   * de la sesión, nunca de la petición. Cualquier rol que no sea el de
   * administrador cae del lado restringido.
   */
  async overview(actor: SessionUser): Promise<Dashboard> {
    const isAdmin = actor.rol === RolUsuario.ADMINISTRADOR;
    const [stats, stockBajo] = await Promise.all([
      this.workOrders.dashboardStats({
        mecanicoId: isAdmin ? undefined : actor.usuarioId,
        incluirAdministracion: isAdmin,
      }),
      isAdmin ? this.products.lowStock(LOW_STOCK_LIMIT) : null,
    ]);
    return new Dashboard({ ...stats, stockBajo });
  }
}
