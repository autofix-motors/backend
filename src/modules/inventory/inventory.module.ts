import { Module } from '@nestjs/common';
import { ProductsModule } from './products/products.module.js';
import { StockMovementsModule } from './stock-movements/stock-movements.module.js';
import { ToolsModule } from './tools/tools.module.js';

// El grupo de inventory.prisma: los repuestos e insumos, sus movimientos de
// stock y las herramientas. app.module importa este módulo y no los de
// adentro.
@Module({
  imports: [ProductsModule, StockMovementsModule, ToolsModule],
})
export class InventoryModule {}
