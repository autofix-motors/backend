import { Module } from '@nestjs/common';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { PortalModule } from './portal/portal.module.js';
import { ServiceCatalogModule } from './service-catalog/service-catalog.module.js';
import { WorkOrdersModule } from './work-orders/work-orders.module.js';

// El grupo de workshop.prisma: el catálogo de servicios, las órdenes de trabajo
// con sus ítems y presupuestos, el portal del cliente y el panel de inicio.
// app.module importa este módulo y no los de adentro.
@Module({
  imports: [
    ServiceCatalogModule,
    WorkOrdersModule,
    PortalModule,
    DashboardModule,
  ],
})
export class WorkshopModule {}
