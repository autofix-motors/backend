import type { Request } from 'express';
import type { RolUsuario } from '../../generated/prisma/enums.js';

/**
 * El rol de un cliente en el JWT. Está fuera del enum `RolUsuario` a propósito:
 * un cliente no es personal del taller, y así ningún `@Roles(...)` ni un cambio
 * de rol en Personal lo puede alcanzar.
 */
export const CUSTOMER_ROLE = 'CLIENTE';

/** Quién puede tener una sesión: el personal (por su rol) o un cliente. */
export type SessionRole = RolUsuario | typeof CUSTOMER_ROLE;

/**
 * Lo que viaja dentro del JWT de acceso. El rol va en el token para que el
 * RolesGuard no consulte la base en cada petición; el costo es que un cambio
 * de rol tarda hasta ACCESS_TOKEN_MINUTES en notarse.
 *
 * `sub` (el nombre estándar del JWT) es el `usuarioId` del personal o el
 * `clienteId` del cliente. `debeCambiarContrasena` es la marca de la
 * contraseña temporal: mientras esté, el PasswordChangeGuard solo deja ver la
 * sesión y cambiarla.
 */
export interface AccessPayload {
  sub: string;
  rol: SessionRole;
  debeCambiarContrasena?: boolean;
}

/** El usuario del personal de la petición, tal como lo deja el AccessGuard. */
export interface SessionUser {
  usuarioId: string;
  rol: RolUsuario;
}

/** El cliente de la petición, en un endpoint de su portal. */
export interface SessionCustomer {
  clienteId: string;
}

/**
 * Quien tiene la sesión, sea quien sea: para los pocos endpoints que sirven a
 * los dos (`@AnySession()`), como ver la sesión o cambiar la contraseña.
 */
export type SessionPrincipal =
  | ({ tipo: 'personal' } & SessionUser)
  | ({ tipo: 'cliente' } & SessionCustomer);

/**
 * La petición después de pasar por el AccessGuard: o `usuario` o `cliente`,
 * nunca los dos.
 */
export type RequestWithSession = Request & {
  usuario?: SessionUser;
  cliente?: SessionCustomer;
  debeCambiarContrasena?: boolean;
};
