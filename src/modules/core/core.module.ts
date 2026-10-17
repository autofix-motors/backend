import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { CustomerAccountsModule } from './customer-accounts/customer-accounts.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { UsersModule } from './users/users.module.js';

// El grupo de core.prisma: acceso, sesiones, usuarios y el acceso de los
// clientes a su portal. app.module importa este módulo y
// no los de adentro; `nest g res modules/core/<module>` registra aquí el módulo
// nuevo, porque es el *.module.ts más cercano.
@Module({
  imports: [AuthModule, SessionsModule, UsersModule, CustomerAccountsModule],
})
export class CoreModule {}
