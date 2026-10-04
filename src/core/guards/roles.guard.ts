import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../../generated/prisma/enums.js';
import type { RequestWithSession } from '../auth/session-user.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

/**
 * Guard global que corre después del AccessGuard: si el endpoint declara
 * @Roles(), el rol del usuario tiene que ser uno de esos. Un endpoint sin el
 * decorador solo exige sesión.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!allowed?.length) return true;

    const { user } = context.switchToHttp().getRequest<RequestWithSession>();
    if (!user || !allowed.includes(user.role)) {
      throw new ForbiddenException('No tienes permiso para esta acción');
    }
    return true;
  }
}
