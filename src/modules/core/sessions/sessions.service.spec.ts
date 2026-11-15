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
    sesionId: 's1',
    usuarioId: 'u1',
    familiaId: 'f1',
    hashToken: hashToken('token'),
    expiraEn: new Date(Date.now() + 60_000),
    revocadaEn: null,
    ...overrides,
  };
}

describe('SessionsService.rotate', () => {
  const tx = {
    sesion: {
      updateMany: vi.fn(),
      create: vi.fn().mockResolvedValue({ sesionId: 's2' }),
      update: vi.fn(),
    },
  };
  const prisma = {
    sesion: { findUnique: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const config = { getOrThrow: vi.fn().mockReturnValue(7) };
  const service = new SessionsService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
  );

  afterEach(() => vi.clearAllMocks());

  it('rechaza un token que no existe', async () => {
    prisma.sesion.findUnique.mockResolvedValue(null);
    await expect(service.rotate('token', {})).rejects.toThrow(EXPIRED);
  });

  it('ante un token ya revocado, revoca la familia entera', async () => {
    prisma.sesion.findUnique.mockResolvedValue(
      session({ revocadaEn: new Date() }),
    );
    await expect(service.rotate('token', {})).rejects.toThrow(EXPIRED);
    expect(prisma.sesion.updateMany).toHaveBeenCalledWith({
      where: { familiaId: 'f1', revocadaEn: null },
      data: { revocadaEn: expect.any(Date) },
    });
  });

  it('rechaza una sesión vencida', async () => {
    prisma.sesion.findUnique.mockResolvedValue(
      session({ expiraEn: new Date(Date.now() - 1000) }),
    );
    await expect(service.rotate('token', {})).rejects.toThrow(EXPIRED);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rota: revoca la usada, crea otra en la misma familia y las enlaza', async () => {
    prisma.sesion.findUnique.mockResolvedValue(session());
    tx.sesion.updateMany.mockResolvedValue({ count: 1 });

    const rotated = await service.rotate('token', {});

    expect(rotated.dueno).toEqual({ usuarioId: 'u1' });
    expect(rotated.familiaId).toBe('f1');
    expect(rotated.token).not.toBe('token');
    expect(tx.sesion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        usuarioId: 'u1',
        cuentaClienteId: null,
        familiaId: 'f1',
        hashToken: hashToken(rotated.token),
      }),
    });
    expect(tx.sesion.update).toHaveBeenCalledWith({
      where: { sesionId: 's1' },
      data: { reemplazadaPorId: 's2' },
    });
  });

  it('rota la sesión de un cliente con su misma cuenta', async () => {
    prisma.sesion.findUnique.mockResolvedValue(
      session({ usuarioId: null, cuentaClienteId: 'ca1' }),
    );
    tx.sesion.updateMany.mockResolvedValue({ count: 1 });

    const rotated = await service.rotate('token', {});

    expect(rotated.dueno).toEqual({ cuentaClienteId: 'ca1' });
    expect(tx.sesion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        usuarioId: null,
        cuentaClienteId: 'ca1',
      }),
    });
  });

  it('si otro refresco ganó la carrera con el mismo token, rechaza el segundo', async () => {
    prisma.sesion.findUnique.mockResolvedValue(session());
    tx.sesion.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.rotate('token', {})).rejects.toThrow(EXPIRED);
    expect(tx.sesion.create).not.toHaveBeenCalled();
  });
});

describe('SessionsService.revokeAll', () => {
  const prisma = { sesion: { updateMany: vi.fn() } };
  const service = new SessionsService(
    prisma as unknown as PrismaService,
    {} as ConfigService,
  );

  afterEach(() => vi.clearAllMocks());

  it('revoca solo las sesiones vigentes de ese usuario', async () => {
    await service.revokeAll({ usuarioId: 'u1' });
    expect(prisma.sesion.updateMany).toHaveBeenCalledWith({
      where: { usuarioId: 'u1', cuentaClienteId: null, revocadaEn: null },
      data: { revocadaEn: expect.any(Date) },
    });
  });

  it('revoca solo las sesiones vigentes de esa cuenta de cliente', async () => {
    await service.revokeAll({ cuentaClienteId: 'ca1' });
    expect(prisma.sesion.updateMany).toHaveBeenCalledWith({
      where: { usuarioId: null, cuentaClienteId: 'ca1', revocadaEn: null },
      data: { revocadaEn: expect.any(Date) },
    });
  });

  it('revoca las del portal de un cliente por su clienteId', async () => {
    await service.revokeAllForCustomer('c1');
    expect(prisma.sesion.updateMany).toHaveBeenCalledWith({
      where: { cuentaCliente: { clienteId: 'c1' }, revocadaEn: null },
      data: { revocadaEn: expect.any(Date) },
    });
  });
});
