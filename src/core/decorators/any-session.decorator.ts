import { SetMetadata } from '@nestjs/common';

export const ANY_SESSION_KEY = 'anySession';

/**
 * El endpoint sirve a cualquier sesión, del personal o de un cliente: ver la
 * propia sesión o cambiar la propia contraseña. El actor se lee con
 * `@CurrentPrincipal()`.
 */
export const AnySession = () => SetMetadata(ANY_SESSION_KEY, true);
