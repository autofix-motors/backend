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
    if (request.user) return { kind: 'staff', ...request.user };
    if (request.customer) return { kind: 'customer', ...request.customer };
    throw new UnauthorizedException('Inicia sesión para continuar');
  },
);
