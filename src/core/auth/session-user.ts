import type { Request } from 'express';
import type { UserRole } from '../../generated/prisma/enums.js';

/**
 * Lo que viaja dentro del JWT de acceso. El rol va en el token para que el
 * RolesGuard no consulte la base en cada petición; el costo es que un cambio
 * de rol tarda hasta ACCESS_TOKEN_MINUTES en notarse.
 */
export interface AccessPayload {
  sub: string;
  role: UserRole;
}

/** El usuario autenticado de la petición, tal como lo deja el AccessGuard. */
export interface SessionUser {
  id: string;
  role: UserRole;
}

/** La petición después de pasar por el AccessGuard. */
export type RequestWithSession = Request & { user?: SessionUser };
