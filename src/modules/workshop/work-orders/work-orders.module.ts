import { Module } from '@nestjs/common';
import { UsersModule } from '../../core/users/users.module.js';
import { CustomersModule } from '../../customer/customers/customers.module.js';
import { VehiclesModule } from '../../customer/vehicles/vehicles.module.js';
import { ProductsModule } from '../../inventory/products/products.module.js';
import { StockMovementsModule } from '../../inventory/stock-movements/stock-movements.module.js';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module.js';
import { WorkOrderItemsService } from './work-order-items.service.js';
import { WorkOrderQuotesService } from './work-order-quotes.service.js';
import { WorkOrdersController } from './work-orders.controller.js';
import { WorkOrdersService } from './work-orders.service.js';

// Importa los módulos dueños del vehículo, del cliente y del personal para
// verificarlos con sus services al recibir un vehículo o asignar una orden; y
// los del catálogo, los repuestos y el kardex para los ítems (el servicio o
// repuesto que se agrega y el stock que mueve). Ninguna de sus tablas se lee
// desde aquí (invariante 3).
@Module({
  imports: [
    VehiclesModule,
    CustomersModule,
    UsersModule,
    ServiceCatalogModule,
    ProductsModule,
    StockMovementsModule,
  ],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService, WorkOrderItemsService, WorkOrderQuotesService],
  // El portal del cliente lee sus órdenes y registra su respuesta al
  // presupuesto con estos services (invariante 3).
  exports: [WorkOrdersService, WorkOrderQuotesService],
})
export class WorkOrdersModule {}
