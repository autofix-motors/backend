import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { normalizeLoginIdentifier } from '../auth/login-identifier.js';

/**
 * Limita los intentos de login contra fuerza bruta.
 *
 * Cuenta por IP, por tipo de login (la ruta: personal o cliente) y por el
 * identificador normalizado, no solo por IP: el frontend es un BFF, así que
 * todas las peticiones llegan desde la IP del servidor del front. Contar solo
 * por IP bloquearía a todos juntos cuando uno se equivoca varias veces.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, any>): Promise<string> {
    const identifier: unknown = req.body?.identifier;
    const key =
      typeof identifier === 'string'
        ? normalizeLoginIdentifier(identifier).value
        : '';
    return Promise.resolve(`${req.ip}:${req.path}:${key}`);
  }
}
