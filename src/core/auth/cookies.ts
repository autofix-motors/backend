import type { CookieOptions } from 'express';

// Nombres y opciones de las cookies de sesión, en un solo lugar: los usan el
// controlador de auth (que las pone y las borra) y el AccessGuard (que las lee).

export const ACCESS_COOKIE = 'afm_access';
export const REFRESH_COOKIE = 'afm_refresh';

/**
 * - httpOnly: JavaScript del navegador no puede leerlas, así que un script
 *   inyectado no roba la sesión.
 * - SameSite=Strict: el navegador no las manda en peticiones que nacen en otro
 *   sitio, lo que cierra la puerta a CSRF.
 * - Secure en producción: solo viajan por HTTPS. En desarrollo se apaga porque
 *   localhost va por HTTP.
 */
function baseOptions(isProduction: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'strict', secure: isProduction };
}

export function accessCookieOptions(
  isProduction: boolean,
  minutes: number,
): CookieOptions {
  return { ...baseOptions(isProduction), path: '/', maxAge: minutes * 60_000 };
}

/**
 * La de refresco solo viaja a /auth: ningún otro endpoint la necesita, y así no
 * acompaña a cada petición de la aplicación.
 */
export function refreshCookieOptions(
  isProduction: boolean,
  days: number,
): CookieOptions {
  return {
    ...baseOptions(isProduction),
    path: '/auth',
    maxAge: days * 86_400_000,
  };
}
