import {
  createParamDecorator,
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type {
  RequestWithSession,
  SessionCustomer,
} from '../auth/session-user.js';

/**
 * El cliente de la petición, en un endpoint de su portal (`@CustomerOnly()`).
 * Con una sesión del personal responde 403.
 */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionCustomer => {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    if (request.customer) return request.customer;
    if (request.user) {
      throw new ForbiddenException('No tienes permiso para esta acción');
    }
    throw new UnauthorizedException('Inicia sesión para continuar');
  },
);
