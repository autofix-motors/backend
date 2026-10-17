import { Module } from '@nestjs/common';
import { SessionsModule } from '../../core/sessions/sessions.module.js';
import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';

// Exporta el service porque vehicles verifica al dueño con él y
// customer-accounts busca al cliente que inicia sesión: ningún otro módulo lee
// la tabla de clientes (invariante 3). Importa SessionsModule para cerrar las
// sesiones del portal al desactivar a un cliente.
@Module({
  imports: [SessionsModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
