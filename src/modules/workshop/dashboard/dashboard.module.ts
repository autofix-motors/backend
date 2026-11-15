import { Module } from '@nestjs/common';
import { ProductsModule } from '../../inventory/products/products.module.js';
import { WorkOrdersModule } from '../work-orders/work-orders.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

// Sin tablas propias, como el portal: las órdenes y el stock se leen con los
// services dueños (invariante 3).
@Module({
  imports: [WorkOrdersModule, ProductsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
