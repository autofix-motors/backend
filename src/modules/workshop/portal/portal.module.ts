import { Module } from '@nestjs/common';
import { VehiclesModule } from '../../customer/vehicles/vehicles.module.js';
import { WorkOrdersModule } from '../work-orders/work-orders.module.js';
import { PortalController } from './portal.controller.js';
import { PortalService } from './portal.service.js';

// Sin tablas propias: los vehículos y las órdenes se leen con los services
// dueños, siempre filtrados por el cliente de la sesión (invariante 3).
@Module({
  imports: [VehiclesModule, WorkOrdersModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
