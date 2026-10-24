import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

// Importa SessionsModule: al desactivar a un usuario o restablecerle la
// contraseña o cambiarle el rol se cierran sus sesiones, y esa tabla es de
// sessions (invariante 3). Exporta su service para que otro módulo verifique a un
// usuario (las herramientas, a quién se asignan) sin leer su tabla.
@Module({
  imports: [SessionsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
