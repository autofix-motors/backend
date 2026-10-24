import { Module } from '@nestjs/common';
import { UsersModule } from '../../core/users/users.module.js';
import { ToolsController } from './tools.controller.js';
import { ToolsService } from './tools.service.js';

// Importa UsersModule para verificar con su service que quien recibe una
// herramienta existe y está activo, sin leer la tabla de usuarios desde aquí.
@Module({
  imports: [UsersModule],
  controllers: [ToolsController],
  providers: [ToolsService],
})
export class ToolsModule {}
