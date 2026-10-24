import { randomInt } from 'node:crypto';
import argon2 from 'argon2';

/**
 * Sin los caracteres que se confunden al leerlos en un chat o dictarlos por
 * teléfono: 0/O/o, 1/l/I/i. Quedan 54 símbolos.
 */
const TEMPORARY_ALPHABET =
  'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** 12 símbolos de 54: unos 69 bits, de sobra para algo que vence en días. */
export const TEMPORARY_PASSWORD_LENGTH = 12;

/**
 * La contraseña que genera el sistema al crear un usuario o habilitar a un
 * cliente, y al restablecerla. `randomInt` es criptográfico y sin sesgo: con
 * `Math.random()` o con un módulo sobre bytes aleatorios, unos símbolos
 * saldrían más que otros.
 */
export function generateTemporaryPassword(): string {
  let password = '';
  for (let i = 0; i < TEMPORARY_PASSWORD_LENGTH; i++) {
    password += TEMPORARY_ALPHABET[randomInt(TEMPORARY_ALPHABET.length)];
  }
  return password;
}

/** Hasta cuándo sirve una temporal generada ahora. */
export function temporaryPasswordExpiry(days: number, now = new Date()): Date {
  return new Date(now.getTime() + days * 86_400_000);
}

/**
 * argon2id, con su sal y parámetros dentro del hash. Es el mismo que usa el
 * administrador sembrado (prisma/seeds/core.seed.ts).
 */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
