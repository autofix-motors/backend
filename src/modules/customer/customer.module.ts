import { Module } from '@nestjs/common';
import { CustomersModule } from './customers/customers.module.js';

// El grupo de customer.prisma: clientes y vehículos. app.module importa este
// módulo y no los de adentro.
@Module({
  imports: [CustomersModule],
})
export class CustomerModule {}
