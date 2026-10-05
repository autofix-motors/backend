import { Module } from '@nestjs/common';
import { ProductsModule } from './products/products.module.js';

// El grupo de inventory.prisma: los repuestos e insumos y, después, sus
// movimientos de stock y las herramientas. app.module importa este módulo y no
// los de adentro.
@Module({
  imports: [ProductsModule],
})
export class InventoryModule {}
