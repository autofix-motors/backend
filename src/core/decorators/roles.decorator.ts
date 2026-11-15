import { SetMetadata } from '@nestjs/common';
import type { RolUsuario } from '../../generated/prisma/enums.js';

export const ROLES_KEY = 'roles';

/**
 * Restringe el endpoint a los roles indicados: basta con tener uno. Un
 * endpoint sin el decorador solo exige sesión.
 */
export const Roles = (...roles: RolUsuario[]) => SetMetadata(ROLES_KEY, roles);
