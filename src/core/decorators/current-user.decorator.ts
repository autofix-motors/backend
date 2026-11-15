import {
  createParamDecorator,
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { RequestWithSession, SessionUser } from '../auth/session-user.js';

/**
 * El usuario del personal de la petición: `method(@CurrentUser() usuario)`. Lo
 * deja el AccessGuard; si falta es que el endpoint se marcó @Public() y aun
 * así pide el usuario, y eso es un error de programación que se corta aquí.
 *
 * Con un cliente responde 403: es la segunda barrera (la primera es el
 * RolesGuard) para que un endpoint del personal mal marcado no le sirva.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser => {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    if (request.usuario) return request.usuario;
    if (request.cliente) {
      throw new ForbiddenException('No tienes permiso para esta acción');
    }
    throw new UnauthorizedException('Inicia sesión para continuar');
  },
);
