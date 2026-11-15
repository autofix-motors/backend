import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { RequestWithSession } from '../auth/session-user.js';

/**
 * Limita los intentos de cambiar la propia contraseña: ahí se adivina la
 * actual, así que tiene el mismo riesgo que el login. Cuenta por quien tiene
 * la sesión.
 */
@Injectable()
export class PasswordThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, any>): Promise<string> {
    const { usuario, cliente } = req as RequestWithSession;
    const owner = usuario
      ? `usuario:${usuario.usuarioId}`
      : cliente
        ? `cliente:${cliente.clienteId}`
        : `ip:${String(req.ip)}`;
    return Promise.resolve(owner);
  }
}
