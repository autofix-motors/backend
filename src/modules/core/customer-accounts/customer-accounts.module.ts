import { Module } from '@nestjs/common';
import { CustomersModule } from '../../customer/customers/customers.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { CustomerAccountsController } from './customer-accounts.controller.js';
import { CustomerAccountsService } from './customer-accounts.service.js';

// Importa CustomersModule para buscar al cliente sin leer su tabla
// (invariante 3) y SessionsModule para cerrar sus sesiones. Exporta su service
// para el login del portal (auth).
@Module({
  imports: [CustomersModule, SessionsModule],
  controllers: [CustomerAccountsController],
  providers: [CustomerAccountsService],
  exports: [CustomerAccountsService],
})
export class CustomerAccountsModule {}
