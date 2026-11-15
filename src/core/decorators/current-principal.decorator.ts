import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type {
  RequestWithSession,
  SessionPrincipal,
} from '../auth/session-user.js';

/** Quien tiene la sesión, personal o cliente: para los `@AnySession()`. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionPrincipal => {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    if (request.usuario) return { tipo: 'personal', ...request.usuario };
    if (request.cliente) return { tipo: 'cliente', ...request.cliente };
    throw new UnauthorizedException('Inicia sesión para continuar');
  },
);
