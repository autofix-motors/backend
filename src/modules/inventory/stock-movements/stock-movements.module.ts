import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module.js';
import { StockMovementsController } from './stock-movements.controller.js';
import { StockMovementsService } from './stock-movements.service.js';

// Importa ProductsModule para mover el stock con su service, sin escribir la
// tabla de productos desde aquí. Exporta su service para las órdenes de
// trabajo: un repuesto agregado (o quitado) registra su movimiento con
// `record`, dentro de la transacción de la orden.
@Module({
  imports: [ProductsModule],
  controllers: [StockMovementsController],
  providers: [StockMovementsService],
  exports: [StockMovementsService],
})
export class StockMovementsModule {}
