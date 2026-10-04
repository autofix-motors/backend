import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';

// El grupo de core.prisma: acceso y usuarios. app.module importa este módulo y
// no los de adentro; `nest g res modules/core/<module>` registra aquí el módulo
// nuevo, porque es el *.module.ts más cercano.
@Module({
  imports: [AuthModule],
})
export class CoreModule {}
