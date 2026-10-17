import { Module } from '@nestjs/common';
import { SessionsService } from './sessions.service.js';

// Sin dependencias propias: lo importan auth (abrir y rotar), users y
// customer-accounts (cerrar sesiones). La tabla de sesiones es de este módulo
// (invariante 3).
@Module({
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
