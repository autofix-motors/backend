import { Module } from '@nestjs/common';
import { ServiceCatalogController } from './service-catalog.controller.js';
import { ServiceCatalogService } from './service-catalog.service.js';

// Exporta el service para las órdenes de trabajo: al agregar un servicio a
// una orden se lee del catálogo (nombre, precio, si está activo) sin consultar
// su tabla desde otro módulo.
@Module({
  controllers: [ServiceCatalogController],
  providers: [ServiceCatalogService],
  exports: [ServiceCatalogService],
})
export class ServiceCatalogModule {}
