import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionsService } from './sessions.service.js';

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
    // Solo lo usa el LoginThrottlerGuard del login: 5 intentos por minuto por
    // IP y correo.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionsService],
})
export class AuthModule {}
