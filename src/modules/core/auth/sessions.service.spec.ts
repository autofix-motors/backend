import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { SessionsService, hashToken } from './sessions.service.js';

// La rotación del refresh es la parte delicada: un token robado y reusado tiene
// que cortar la familia entera, y dos refrescos simultáneos no pueden pasar los
// dos.

const EXPIRED = new UnauthorizedException(
  'Tu sesión expiró. Vuelve a iniciar sesión',
);

function session(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 's1',
    userId: 'u1',
    familyId: 'f1',
    tokenHash: hashToken('token'),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    ...overrides,
  };
}

describe('SessionsService.rotate', () => {
  const tx = {
    session: {
      updateMany: vi.fn(),
      create: vi.fn().mockResolvedValue({ sessionId: 's2' }),
      update: vi.fn(),
    },
  };
  const prisma = {
    session: { findUnique: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const config = { getOrThrow: vi.fn().mockReturnValue(7) };
  const service = new SessionsService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
  );

  afterEach(() => vi.clearAllMocks());

  it('rechaza un token que no existe', async () => {
    prisma.session.findUnique.mockResolvedValue(null);
    await expect(service.rotate('token', {})).rejects.toThrow(EXPIRED);
  });

  it('ante un token ya revocado, revoca la familia entera', async () => {
    prisma.session.findUnique.mockResolvedValue(
      session({ revokedAt: new Date() }),
    );
    await expect(service.rotate('token', {})).rejects.toThrow(EXPIRED);
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'f1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rechaza una sesión vencida', async () => {
    prisma.session.findUnique.mockResolvedValue(
      session({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(service.rotate('token', {})).rejects.toThrow(EXPIRED);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rota: revoca la usada, crea otra en la misma familia y las enlaza', async () => {
    prisma.session.findUnique.mockResolvedValue(session());
    tx.session.updateMany.mockResolvedValue({ count: 1 });

    const rotated = await service.rotate('token', {});

    expect(rotated.userId).toBe('u1');
    expect(rotated.familyId).toBe('f1');
    expect(rotated.token).not.toBe('token');
    expect(tx.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        familyId: 'f1',
        tokenHash: hashToken(rotated.token),
      }),
    });
    expect(tx.session.update).toHaveBeenCalledWith({
      where: { sessionId: 's1' },
      data: { replacedById: 's2' },
    });
  });

  it('si otro refresco ganó la carrera con el mismo token, rechaza el segundo', async () => {
    prisma.session.findUnique.mockResolvedValue(session());
    tx.session.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.rotate('token', {})).rejects.toThrow(EXPIRED);
    expect(tx.session.create).not.toHaveBeenCalled();
  });
});
