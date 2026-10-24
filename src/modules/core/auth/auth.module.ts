import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomersModule } from '../../customer/customers/customers.module.js';
import { CustomerAccountsModule } from '../customer-accounts/customer-accounts.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [
    // Global: el AccessGuard (src/core/guards) necesita JwtService para
    // verificar el token en cada petición, desde cualquier módulo.
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // El algoritmo se fija en los dos lados: sin esto, un token firmado con
        // otro algoritmo podría aceptarse al verificar.
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    // Solo lo usan los guards de los logins y del cambio de contraseña: 5
    // intentos por minuto y 20 por hora. El de la hora frena a quien prueba
    // despacio para no tocar el límite del minuto.
    ThrottlerModule.forRoot([
      { name: 'minute', ttl: 60_000, limit: 5 },
      { name: 'hour', ttl: 3_600_000, limit: 20 },
    ]),
    SessionsModule,
    // El login del portal busca la cuenta y el cliente por sus services
    // (invariante 3).
    CustomerAccountsModule,
    CustomersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
