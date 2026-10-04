import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Limita los intentos de login contra fuerza bruta.
 *
 * Cuenta por IP y correo, no solo por IP: el frontend es un BFF, así que todas
 * las peticiones llegan desde la IP del servidor del front. Contar solo por IP
 * bloquearía a todos los usuarios juntos cuando uno se equivoca varias veces.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, any>): Promise<string> {
    const email: unknown = req.body?.email;
    const key = typeof email === 'string' ? email.trim().toLowerCase() : '';
    return Promise.resolve(`${req.ip}:${key}`);
  }
}
