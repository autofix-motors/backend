import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

// Exporta el service para los movimientos de stock: el stock y el costo se
// escriben solo con `applyStockChange`, sin que otro módulo toque la tabla.
@Module({
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
