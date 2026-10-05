import { Module } from '@nestjs/common';
import { ServiceCatalogModule } from './service-catalog/service-catalog.module.js';

// El grupo de workshop.prisma: el catálogo de servicios y, después, las
// órdenes de trabajo y sus presupuestos. app.module importa este módulo y no
// los de adentro.
@Module({
  imports: [ServiceCatalogModule],
})
export class WorkshopModule {}
