import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module.js';
import { VehiclesController } from './vehicles.controller.js';
import { VehiclesService } from './vehicles.service.js';

// Importa CustomersModule para verificar al dueño con su service, sin leer la
// tabla de clientes desde aquí. Exporta su service para que las órdenes de
// trabajo lean el vehículo que ingresa (y su dueño) sin leer esta tabla.
@Module({
  imports: [CustomersModule],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
