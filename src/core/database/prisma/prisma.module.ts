import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// Global para no tener que importarlo en cada módulo: el acceso a la base lo
// necesitan todos, y repetir el import en veinte módulos no aporta nada. Sus
// errores los traduce el filtro global (core/filters/api-exception.filter.ts).
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
