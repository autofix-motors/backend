import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import argon2 from 'argon2';
import type { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { ConfigService } from '@nestjs/config';
import type { SessionsService } from '../sessions/sessions.service.js';
import {
  UsersService,
  describeHistory,
  usersOrderBy,
  usersWhere,
} from './users.service.js';

// Lo que se prueba es lo que decide: cómo se arman la búsqueda y el orden, que
// la contraseña se guarde como hash, que nadie se desactive ni se quite el rol
// a sí mismo, que siempre quede un administrador activo, cuándo se cierran las
// sesiones y que un usuario con historial no se borre.

const ADMIN = { userId: 'a1', role: 'ADMIN' as const };

const NO_HISTORY = {
  assignedWorkOrders: 0,
  createdWorkOrders: 0,
  workOrderEvents: 0,
  sentQuotes: 0,
  decidedQuotes: 0,
  stockMovements: 0,
  assignedTools: 0,
  receivedPayments: 0,
  voidedPayments: 0,
};

function user(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'u1',
    email: 'jquispe@autofix.local',
    name: 'Juan Quispe',
    role: 'MECHANIC',
    isActive: true,
    _count: { assignedWorkOrders: 0 },
    ...overrides,
  };
}

describe('usersWhere', () => {
  it('sin búsqueda ni filtros no restringe nada', () => {
    expect(usersWhere({})).toEqual({ role: undefined, isActive: undefined });
  });

  it('busca en el nombre, el correo y el DNI, y filtra por rol y estado', () => {
    const text = { contains: 'quispe', mode: 'insensitive' };
    expect(
      usersWhere({ search: 'quispe', role: 'MECHANIC', isActive: false }),
    ).toEqual({
      role: 'MECHANIC',
      isActive: false,
      OR: [
        { name: text },
        { email: text },
        { documentNumber: { contains: 'quispe' } },
      ],
    });
  });

  it('busca el DNI sin puntos ni espacios', () => {
    expect(usersWhere({ search: '45.678 912' }).OR).toContainEqual({
      documentNumber: { contains: '45678912' },
    });
  });
});

describe('usersOrderBy', () => {
  it('ordena por el campo pedido', () => {
    expect(usersOrderBy({ sortBy: 'name', sortOrder: 'asc' })).toEqual({
      name: 'asc',
    });
  });

  it('deja al final a quien nunca inició sesión, también en descendente', () => {
    expect(usersOrderBy({ sortBy: 'lastLoginAt', sortOrder: 'desc' })).toEqual({
      lastLoginAt: { sort: 'desc', nulls: 'last' },
    });
  });
});

describe('describeHistory', () => {
  it('sin historial no dice nada', () => {
    expect(describeHistory(NO_HISTORY)).toBe('');
  });

  it('nombra cada cosa con su cantidad, en singular o plural', () => {
    expect(
      describeHistory({
        ...NO_HISTORY,
        assignedWorkOrders: 3,
        receivedPayments: 1,
        stockMovements: 2,
      }),
    ).toBe('3 órdenes asignadas, 2 movimientos de stock y 1 pago recibido');
  });
});

describe('UsersService', () => {
  const prisma = {
    $transaction: vi.fn((queries: unknown[]) => Promise.all(queries)),
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const sessions = { revokeAll: vi.fn() };
  const config = { getOrThrow: vi.fn().mockReturnValue(7) };
  const service = new UsersService(
    prisma as unknown as PrismaService,
    sessions as unknown as SessionsService,
    config as unknown as ConfigService,
  );

  afterEach(() => vi.clearAllMocks());

  it('pagina el listado con desempate por id', async () => {
    prisma.user.findMany.mockResolvedValue([user()]);
    prisma.user.count.mockResolvedValue(12);

    const page = await service.findAll({
      page: 2,
      pageSize: 10,
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        orderBy: [{ name: 'asc' }, { userId: 'asc' }],
      }),
    );
    expect(page.meta).toEqual({
      page: 2,
      pageSize: 10,
      total: 12,
      totalPages: 2,
    });
  });

  describe('create', () => {
    it('genera una temporal: guarda su hash con la marca y la devuelve una vez', async () => {
      prisma.user.create.mockResolvedValue(user());

      const result = await service.create({
        email: 'jquispe@autofix.local',
        documentNumber: '45678912',
        name: 'Juan Quispe',
        role: 'MECHANIC',
      });

      const { data } = prisma.user.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data).not.toHaveProperty('temporaryPassword');
      expect(data).toMatchObject({
        documentNumber: '45678912',
        mustChangePassword: true,
        passwordExpiresAt: result.expiresAt,
      });
      expect(String(data.passwordHash)).toMatch(/^\$argon2id\$/);
      expect(result.temporaryPassword).toHaveLength(12);
      expect(
        await argon2.verify(String(data.passwordHash), result.temporaryPassword),
      ).toBe(true);
    });

    it('traduce un correo o un DNI repetido a un 409 claro', async () => {
      const dto = {
        email: 'jquispe@autofix.local',
        documentNumber: '45678912',
        name: 'Juan',
        role: 'MECHANIC' as const,
      };
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicado', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['email'] },
        }),
      );
      await expect(service.create(dto)).rejects.toThrow(
        new ConflictException('Ya existe un usuario con ese correo'),
      );

      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicado', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['document_number'] },
        }),
      );
      await expect(service.create(dto)).rejects.toThrow(
        new ConflictException('Ya existe un usuario con ese DNI'),
      );
    });
  });

  describe('update', () => {
    it('no deja que el administrador se desactive a sí mismo', async () => {
      prisma.user.findUnique.mockResolvedValue(
        user({ userId: 'a1', role: 'ADMIN' }),
      );
      await expect(
        service.update('a1', { isActive: false }, ADMIN),
      ).rejects.toThrow(
        new BadRequestException('No puedes desactivar tu propio usuario'),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('no deja que el administrador se quite el rol', async () => {
      prisma.user.findUnique.mockResolvedValue(
        user({ userId: 'a1', role: 'ADMIN' }),
      );
      await expect(
        service.update('a1', { role: 'MECHANIC' }, ADMIN),
      ).rejects.toThrow(
        new BadRequestException('No puedes quitarte el rol de administrador'),
      );
    });

    it('deja que el administrador edite sus propios datos', async () => {
      prisma.user.findUnique.mockResolvedValue(
        user({ userId: 'a1', role: 'ADMIN' }),
      );
      prisma.user.update.mockResolvedValue(user({ userId: 'a1' }));

      await service.update(
        'a1',
        { name: 'Ana', role: 'ADMIN', isActive: true },
        ADMIN,
      );

      expect(prisma.user.update).toHaveBeenCalled();
      expect(sessions.revokeAll).not.toHaveBeenCalled();
    });

    it('no degrada ni desactiva al último administrador activo', async () => {
      prisma.user.findUnique.mockResolvedValue(
        user({ userId: 'a2', role: 'ADMIN' }),
      );
      prisma.user.count.mockResolvedValue(0);

      for (const change of [{ role: 'MECHANIC' }, { isActive: false }]) {
        await expect(
          service.update('a2', change as never, ADMIN),
        ).rejects.toThrow(ConflictException);
      }
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { role: 'ADMIN', isActive: true, NOT: { userId: 'a2' } },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('al desactivar a alguien cierra sus sesiones', async () => {
      prisma.user.findUnique.mockResolvedValue(user());
      prisma.user.update.mockResolvedValue(user({ isActive: false }));

      await service.update('u1', { isActive: false }, ADMIN);

      expect(sessions.revokeAll).toHaveBeenCalledWith({ userId: 'u1' });
    });

    it('al cambiarle el rol cierra sus sesiones, si queda otro administrador', async () => {
      prisma.user.findUnique.mockResolvedValue(
        user({ userId: 'a2', role: 'ADMIN' }),
      );
      prisma.user.count.mockResolvedValue(1);
      prisma.user.update.mockResolvedValue(user({ userId: 'a2' }));

      await service.update('a2', { role: 'MECHANIC' }, ADMIN);

      expect(sessions.revokeAll).toHaveBeenCalledWith({ userId: 'a2' });
    });

    it('editar datos sin cambiar rol ni estado no cierra sesiones', async () => {
      prisma.user.findUnique.mockResolvedValue(user());
      prisma.user.update.mockResolvedValue(user());

      await service.update(
        'u1',
        { phone: '987654321', role: 'MECHANIC', isActive: true },
        ADMIN,
      );

      expect(prisma.user.count).not.toHaveBeenCalled();
      expect(sessions.revokeAll).not.toHaveBeenCalled();
    });

    it('traduce un correo repetido a un 409 claro', async () => {
      prisma.user.findUnique.mockResolvedValue(user());
      prisma.user.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicado', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.update('u1', { email: 'otro@autofix.local' }, ADMIN),
      ).rejects.toThrow(
        new ConflictException('Ya existe un usuario con ese correo'),
      );
    });
  });

  describe('issueTemporaryPassword', () => {
    it('guarda una temporal nueva con la marca y cierra sus sesiones', async () => {
      prisma.user.findUnique.mockResolvedValue(user());
      prisma.user.update.mockResolvedValue(user());

      const result = await service.issueTemporaryPassword('u1');

      const { data } = prisma.user.update.mock.calls[0][0] as {
        data: { passwordHash: string; mustChangePassword: boolean };
      };
      expect(data.mustChangePassword).toBe(true);
      expect(
        await argon2.verify(data.passwordHash, result.temporaryPassword),
      ).toBe(true);
      expect(sessions.revokeAll).toHaveBeenCalledWith({ userId: 'u1' });
    });

    it('responde 404 si el usuario no existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.issueTemporaryPassword('u1')).rejects.toThrow(
        NotFoundException,
      );
      expect(sessions.revokeAll).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('no deja que el administrador se borre a sí mismo', async () => {
      await expect(service.remove('a1', ADMIN)).rejects.toThrow(
        new BadRequestException('No puedes eliminar tu propio usuario'),
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('no borra a un usuario con historial, y dice por qué', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'MECHANIC',
        isActive: true,
        _count: { ...NO_HISTORY, assignedWorkOrders: 2, workOrderEvents: 1 },
      });
      await expect(service.remove('u1', ADMIN)).rejects.toThrow(
        new ConflictException(
          'No se puede eliminar: el usuario tiene 2 órdenes asignadas y 1 nota o cambio de estado en una orden. Puedes desactivarlo',
        ),
      );
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('no borra al último administrador activo', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'ADMIN',
        isActive: true,
        _count: NO_HISTORY,
      });
      prisma.user.count.mockResolvedValue(0);
      await expect(service.remove('a2', ADMIN)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('borra de verdad a un usuario sin historial', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'MECHANIC',
        isActive: false,
        _count: NO_HISTORY,
      });
      await service.remove('u1', ADMIN);
      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
    });

    it('responde 404 al borrar un usuario que no existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.remove('u1', ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
