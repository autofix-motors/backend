import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestWithSession } from '../auth/session-user.js';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from '../decorators/allow-pending-password-change.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

/**
 * Guard global, el último: con la contraseña temporal sin cambiar, solo se
 * puede ver la sesión y cambiarla (`@AllowPendingPasswordChange()`). La marca
 * viaja en el JWT, así que no consulta la base; al cambiar la contraseña se
 * emite un token sin ella.
 *
 * Es lo que hace que la temporal que viajó por WhatsApp no sirva para usar el
 * sistema, solo para elegir una propia.
 */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    if (!request.mustChangePassword) return true;
    if (
      this.reflector.getAllAndOverride<boolean>(
        ALLOW_PENDING_PASSWORD_CHANGE_KEY,
        targets,
      )
    ) {
      return true;
    }
    throw new ForbiddenException(
      'Cambia tu contraseña temporal para continuar',
    );
  }
}
