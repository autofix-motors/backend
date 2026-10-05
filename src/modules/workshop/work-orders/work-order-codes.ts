import { randomInt } from 'node:crypto';

/**
 * Las letras y dígitos del código de seguimiento, sin los que se confunden al
 * dictarlo o al leerlo impreso: 0/O, 1/I/L. Con 31 símbolos y 6 posiciones hay
 * unos 887 millones de códigos: con el límite de intentos de la página
 * pública, recorrerlos a ciegas no es viable.
 */
export const TRACKING_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const TRACKING_CODE_LENGTH = 6;

/**
 * Un código de seguimiento nuevo (`AFM-7K3Q9X`). Sale de `crypto` y no de
 * `Math.random`, que es predecible: el código es la llave de la página
 * pública. `pick` se inyecta en los tests.
 */
export function generateTrackingCode(
  pick: (max: number) => number = randomInt,
): string {
  let code = '';
  for (let i = 0; i < TRACKING_CODE_LENGTH; i++) {
    code += TRACKING_CODE_ALPHABET[pick(TRACKING_CODE_ALPHABET.length)];
  }
  return `AFM-${code}`;
}

/** Cómo nombra el taller a una orden: «OT-000123». */
export function formatWorkOrderNumber(number: number): string {
  return `OT-${String(number).padStart(6, '0')}`;
}

/**
 * El número de orden que hay en una búsqueda («123», «OT-000123»,
 * «ot123»), o `undefined` si el texto no es un número de orden. Un número que
 * no cabe en la columna (`Int`) tampoco lo es: compararlo haría fallar la
 * consulta.
 */
export function parseWorkOrderNumber(search: string): number | undefined {
  const match = /^(?:OT-?)?(\d{1,9})$/i.exec(search.trim());
  return match ? Number(match[1]) : undefined;
}
