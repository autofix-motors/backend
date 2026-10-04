import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { RequestWithSession, SessionUser } from '../auth/session-user.js';

/**
 * El usuario autenticado de la petición: `method(@CurrentUser() user)`. Lo deja
 * el AccessGuard; si falta es que el endpoint se marcó @Public() y aun así pide
 * el usuario, y eso es un error de programación que se corta aquí.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser => {
    const user = context.switchToHttp().getRequest<RequestWithSession>().user;
    if (!user) throw new UnauthorizedException('Inicia sesión para continuar');
    return user;
  },
);
