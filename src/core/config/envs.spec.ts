import { envsSchema } from './envs.js';

// Lo que decide algo del entorno: qué combinaciones dejan arrancar la API. Las
// variables llegan como texto, igual que desde el .env. Un error aquí se ve al
// desplegar, no en el primer inicio de sesión.

const base = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://localhost/autofix_motors',
  JWT_SECRET: 'x'.repeat(32),
};

const validate = (extra: Record<string, string | undefined>) =>
  envsSchema.validate({ ...base, ...extra }).error?.message;

describe('envsSchema', () => {
  it('arranca con lo mínimo y completa los valores por defecto', () => {
    expect(envsSchema.validate(base).value).toMatchObject({
      PORT: 3001,
      ACCESS_TOKEN_MINUTES: 15,
      REFRESH_TOKEN_DAYS: 7,
    });
  });

  it('no arranca sin JWT_SECRET', () => {
    expect(validate({ JWT_SECRET: undefined })).toMatch(/JWT_SECRET/);
  });

  it('no arranca con un JWT_SECRET corto', () => {
    expect(validate({ JWT_SECRET: 'corto' })).toBe(
      'JWT_SECRET tiene que tener al menos 32 caracteres',
    );
  });

  it('no arranca sin DATABASE_URL', () => {
    expect(validate({ DATABASE_URL: undefined })).toMatch(/DATABASE_URL/);
  });
});
