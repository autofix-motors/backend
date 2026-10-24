import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ACCESS_COOKIE } from '../auth/cookies.js';
import {
  CUSTOMER_ROLE,
  type AccessPayload,
  type RequestWithSession,
} from '../auth/session-user.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

/**
 * Guard global: toda petición necesita un JWT de acceso válido en la cookie
 * afm_access, salvo los endpoints marcados con @Public(). Si el token es
 * válido, deja en la petición al usuario del personal (`request.user`, para
 * @CurrentUser()) o al cliente (`request.customer`), nunca a los dos, y la
 * marca de contraseña temporal para el PasswordChangeGuard.
 *
 * No consulta la base: la firma y el vencimiento del token alcanzan. Por eso un
 * usuario dado de baja conserva el acceso hasta que su token vence; el refresco
 * sí lo rechaza.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const token: unknown = request.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string' || !token) {
      throw new UnauthorizedException('Inicia sesión para continuar');
    }

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token);
    } catch {
      // Vencido, mal firmado o alterado: para el usuario es lo mismo, y el
      // detalle no se le da a quien pudo haber fabricado el token.
      throw new UnauthorizedException('Tu sesión expiró');
    }

    if (payload.role === CUSTOMER_ROLE) {
      request.customer = { customerId: payload.sub };
    } else {
      request.user = { userId: payload.sub, role: payload.role };
    }
    // Un token emitido antes de que existiera la marca no la trae: no está
    // pendiente.
    request.mustChangePassword = payload.mustChangePassword === true;
    return true;
  }
}
