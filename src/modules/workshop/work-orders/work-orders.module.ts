import { Module } from '@nestjs/common';
import { UsersModule } from '../../core/users/users.module.js';
import { CustomersModule } from '../../customer/customers/customers.module.js';
import { VehiclesModule } from '../../customer/vehicles/vehicles.module.js';
import { WorkOrdersController } from './work-orders.controller.js';
import { WorkOrdersService } from './work-orders.service.js';

// Importa los módulos dueños del vehículo, del cliente y del personal para
// verificarlos con sus services al recibir un vehículo o asignar una orden,
// sin leer sus tablas desde aquí (invariante 3).
@Module({
  imports: [VehiclesModule, CustomersModule, UsersModule],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService],
})
export class WorkOrdersModule {}
