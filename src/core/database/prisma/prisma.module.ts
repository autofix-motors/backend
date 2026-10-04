import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PrismaExceptionFilter } from './prisma-exception.filter.js';
import { PrismaService } from './prisma.service.js';

// Global para no tener que importarlo en cada módulo: el acceso a la base lo
// necesitan todos, y repetir el import en veinte módulos no aporta nada.
@Global()
@Module({
  providers: [
    PrismaService,
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
