import { Module } from '@nestjs/common';
import { ServiceCatalogModule } from './service-catalog/service-catalog.module.js';
import { WorkOrdersModule } from './work-orders/work-orders.module.js';

// El grupo de workshop.prisma: el catálogo de servicios y las órdenes de
// trabajo, con sus ítems y presupuestos. app.module importa este módulo y no
// los de adentro.
@Module({
  imports: [ServiceCatalogModule, WorkOrdersModule],
})
export class WorkshopModule {}
