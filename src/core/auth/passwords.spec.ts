import {
  generateTemporaryPassword,
  hashPassword,
  temporaryPasswordExpiry,
  TEMPORARY_PASSWORD_LENGTH,
  verifyPassword,
} from './passwords.js';

describe('generateTemporaryPassword', () => {
  it('tiene 12 caracteres, sin los que se confunden al leerlos', () => {
    for (let i = 0; i < 200; i++) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(TEMPORARY_PASSWORD_LENGTH);
      expect(password).toMatch(/^[A-Za-z0-9]+$/);
      expect(password).not.toMatch(/[0O1lIio]/);
    }
  });

  it('no se repite', () => {
    const passwords = new Set(
      Array.from({ length: 200 }, generateTemporaryPassword),
    );
    expect(passwords.size).toBe(200);
  });
});

describe('temporaryPasswordExpiry', () => {
  it('vence los días indicados después', () => {
    const now = new Date('2026-10-17T12:00:00Z');
    expect(temporaryPasswordExpiry(7, now)).toEqual(
      new Date('2026-10-24T12:00:00Z'),
    );
  });
});

describe('hashPassword', () => {
  it('guarda argon2id y verifica la misma contraseña, no otra', async () => {
    const hash = await hashPassword('Clave-de-prueba');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'Clave-de-prueba')).toBe(true);
    expect(await verifyPassword(hash, 'otra')).toBe(false);
  });
});
