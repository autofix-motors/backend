import { Module } from '@nestjs/common';
import { ProductsModule } from './products/products.module.js';
import { StockMovementsModule } from './stock-movements/stock-movements.module.js';

// El grupo de inventory.prisma: los repuestos e insumos y sus movimientos de
// stock. app.module importa este módulo y no los de adentro.
@Module({
  imports: [ProductsModule, StockMovementsModule],
})
export class InventoryModule {}
