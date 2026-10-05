import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';

// Exporta el service porque vehicles verifica al dueño con él: ningún otro
// módulo lee la tabla de clientes (invariante 3).
@Module({
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
