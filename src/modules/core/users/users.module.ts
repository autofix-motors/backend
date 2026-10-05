import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

// Importa AuthModule por SessionsService: al desactivar a un usuario o
// cambiarle la contraseña o el rol se cierran sus sesiones, y esa tabla es de
// auth (invariante 3). Exporta su service para que otro módulo verifique a un
// usuario (las herramientas, a quién se asignan) sin leer su tabla.
@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
