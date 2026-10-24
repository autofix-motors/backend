import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../../generated/prisma/enums.js';
import type { RequestWithSession } from '../auth/session-user.js';
import { ANY_SESSION_KEY } from '../decorators/any-session.decorator.js';
import { CUSTOMER_ONLY_KEY } from '../decorators/customer-only.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

const FORBIDDEN = 'No tienes permiso para esta acción';

/**
 * Guard global que corre después del AccessGuard y decide quién entra:
 *
 * | El endpoint declara      | Personal                    | Cliente |
 * |--------------------------|-----------------------------|---------|
 * | `@Public()`              | pasa                        | pasa    |
 * | `@Roles(...)`            | pasa si su rol está         | 403     |
 * | nada                     | pasa (solo exige sesión)    | **403** |
 * | `@CustomerOnly()`        | 403                         | pasa    |
 * | `@AnySession()`          | pasa                        | pasa    |
 *
 * Al cliente se le niega por defecto: un endpoint del taller que se olvide el
 * `@Roles` queda cerrado para él en vez de abierto.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    const isAnySession = this.reflector.getAllAndOverride<boolean>(
      ANY_SESSION_KEY,
      targets,
    );
    const isCustomerOnly = this.reflector.getAllAndOverride<boolean>(
      CUSTOMER_ONLY_KEY,
      targets,
    );
    const { user, customer } = context
      .switchToHttp()
      .getRequest<RequestWithSession>();

    if (customer) {
      if (isAnySession || isCustomerOnly) return true;
      throw new ForbiddenException(FORBIDDEN);
    }
    if (!user) throw new ForbiddenException(FORBIDDEN);
    if (isAnySession) return true;
    if (isCustomerOnly) throw new ForbiddenException(FORBIDDEN);

    const allowed = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      targets,
    );
    if (allowed?.length && !allowed.includes(user.role)) {
      throw new ForbiddenException(FORBIDDEN);
    }
    return true;
  }
}
