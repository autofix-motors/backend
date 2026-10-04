import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import type { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import type { SessionsService } from './sessions.service.js';

// Lo que se prueba es lo que decide: qué credenciales entran, qué mensaje sale
// en cada caso y que un correo inexistente no se distinga de uno existente.

const PASSWORD = 'contrasena-correcta';

async function user(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'u1',
    email: 'ana@taller.local',
    name: 'Ana',
    isActive: true,
    passwordHash: await argon2.hash(PASSWORD),
    role: 'MECHANIC',
    ...overrides,
  };
}

describe('AuthService', () => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
  };
  const sessions = { create: vi.fn().mockResolvedValue('refresh-token') };
  const config = { getOrThrow: vi.fn().mockReturnValue(15) };
  const jwt = new JwtService({
    secret: 'secreto-de-prueba-con-mas-de-32-caracteres',
  });
  let service: AuthService;

  beforeAll(async () => {
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt,
      config as unknown as ConfigService,
      sessions as unknown as SessionsService,
    );
    await service.onModuleInit();
  });

  afterEach(() => vi.clearAllMocks());

  it('rechaza un correo que no existe con el mismo mensaje, verificando igual una contraseña', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const verify = vi.spyOn(argon2, 'verify');

    await expect(
      service.login('nadie@taller.local', PASSWORD, {}),
    ).rejects.toThrow(
      new UnauthorizedException('Correo o contraseña incorrectos'),
    );
    // Si no se verificara, el correo inexistente respondería más rápido y
    // delataría qué correos tienen cuenta.
    expect(verify).toHaveBeenCalledOnce();
    verify.mockRestore();
  });

  it('rechaza una contraseña incorrecta', async () => {
    prisma.user.findUnique.mockResolvedValue(await user());
    await expect(service.login('ana@taller.local', 'otra', {})).rejects.toThrow(
      new UnauthorizedException('Correo o contraseña incorrectos'),
    );
  });

  it('rechaza a un usuario sin contraseña asignada', async () => {
    prisma.user.findUnique.mockResolvedValue(
      await user({ passwordHash: null }),
    );
    await expect(
      service.login('ana@taller.local', PASSWORD, {}),
    ).rejects.toThrow(
      new UnauthorizedException('Correo o contraseña incorrectos'),
    );
  });

  it('rechaza a un usuario dado de baja aunque la contraseña sea correcta', async () => {
    prisma.user.findUnique.mockResolvedValue(await user({ isActive: false }));
    await expect(
      service.login('ana@taller.local', PASSWORD, {}),
    ).rejects.toThrow(
      new UnauthorizedException('Tu usuario está dado de baja'),
    );
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('con credenciales correctas firma el acceso con el rol y abre la sesión', async () => {
    prisma.user.findUnique.mockResolvedValue(await user());

    const result = await service.login('ana@taller.local', PASSWORD, {});

    const payload = await jwt.verifyAsync<Record<string, unknown>>(
      result.accessToken,
    );
    expect(payload).toMatchObject({
      sub: 'u1',
      role: 'MECHANIC',
    });
    expect(result.refreshToken).toBe('refresh-token');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
  });
});
