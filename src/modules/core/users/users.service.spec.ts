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

const ADMIN = { usuarioId: 'a1', rol: 'ADMINISTRADOR' as const };

const NO_HISTORY = {
  ordenesAsignadas: 0,
  ordenesCreadas: 0,
  eventosOrden: 0,
  presupuestosEnviados: 0,
  presupuestosDecididos: 0,
  movimientosStock: 0,
};

function user(overrides: Record<string, unknown> = {}) {
  return {
    usuarioId: 'u1',
    correo: 'jquispe@autofix.local',
    nombre: 'Juan Quispe',
    rol: 'MECANICO',
    activo: true,
    _count: { ordenesAsignadas: 0 },
    ...overrides,
  };
}

describe('usersWhere', () => {
  it('sin búsqueda ni filtros no restringe nada', () => {
    expect(usersWhere({})).toEqual({ rol: undefined, activo: undefined });
  });

  it('busca en el nombre, el correo y el DNI, y filtra por rol y estado', () => {
    const text = { contains: 'quispe', mode: 'insensitive' };
    expect(
      usersWhere({ search: 'quispe', rol: 'MECANICO', activo: false }),
    ).toEqual({
      rol: 'MECANICO',
      activo: false,
      OR: [
        { nombre: text },
        { correo: text },
        { numeroDocumento: { contains: 'quispe' } },
      ],
    });
  });

  it('busca el DNI sin puntos ni espacios', () => {
    expect(usersWhere({ search: '45.678 912' }).OR).toContainEqual({
      numeroDocumento: { contains: '45678912' },
    });
  });
});

describe('usersOrderBy', () => {
  it('ordena por el campo pedido', () => {
    expect(usersOrderBy({ ordenarPor: 'nombre', sentido: 'asc' })).toEqual({
      nombre: 'asc',
    });
  });

  it('deja al final a quien nunca inició sesión, también en descendente', () => {
    expect(
      usersOrderBy({ ordenarPor: 'ultimoIngresoEn', sentido: 'desc' }),
    ).toEqual({
      ultimoIngresoEn: { sort: 'desc', nulls: 'last' },
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
        ordenesAsignadas: 3,
        presupuestosEnviados: 1,
        movimientosStock: 2,
      }),
    ).toBe(
      '3 órdenes asignadas, 1 presupuesto enviado y 2 movimientos de stock',
    );
  });
});

describe('UsersService', () => {
  const prisma = {
    $transaction: vi.fn((queries: unknown[]) => Promise.all(queries)),
    usuario: {
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
    prisma.usuario.findMany.mockResolvedValue([user()]);
    prisma.usuario.count.mockResolvedValue(12);

    const page = await service.findAll({
      page: 2,
      pageSize: 10,
      ordenarPor: 'nombre',
      sentido: 'asc',
    });

    expect(prisma.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        orderBy: [{ nombre: 'asc' }, { usuarioId: 'asc' }],
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
      prisma.usuario.create.mockResolvedValue(user());

      const result = await service.create({
        correo: 'jquispe@autofix.local',
        numeroDocumento: '45678912',
        nombre: 'Juan Quispe',
        rol: 'MECANICO',
      });

      const { data } = prisma.usuario.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data).not.toHaveProperty('contrasenaTemporal');
      expect(data).toMatchObject({
        numeroDocumento: '45678912',
        debeCambiarContrasena: true,
        contrasenaExpiraEn: result.expiraEn,
      });
      expect(String(data.hashContrasena)).toMatch(/^\$argon2id\$/);
      expect(result.contrasenaTemporal).toHaveLength(12);
      expect(
        await argon2.verify(
          String(data.hashContrasena),
          result.contrasenaTemporal,
        ),
      ).toBe(true);
    });

    it('traduce un correo o un DNI repetido a un 409 claro', async () => {
      const dto = {
        correo: 'jquispe@autofix.local',
        numeroDocumento: '45678912',
        nombre: 'Juan',
        rol: 'MECANICO' as const,
      };
      prisma.usuario.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicado', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['correo'] },
        }),
      );
      await expect(service.create(dto)).rejects.toThrow(
        new ConflictException('Ya existe un usuario con ese correo'),
      );

      prisma.usuario.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicado', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['numero_documento'] },
        }),
      );
      await expect(service.create(dto)).rejects.toThrow(
        new ConflictException('Ya existe un usuario con ese DNI'),
      );
    });
  });

  describe('update', () => {
    it('no deja que el administrador se desactive a sí mismo', async () => {
      prisma.usuario.findUnique.mockResolvedValue(
        user({ usuarioId: 'a1', rol: 'ADMINISTRADOR' }),
      );
      await expect(
        service.update('a1', { activo: false }, ADMIN),
      ).rejects.toThrow(
        new BadRequestException('No puedes desactivar tu propio usuario'),
      );
      expect(prisma.usuario.update).not.toHaveBeenCalled();
    });

    it('no deja que el administrador se quite el rol', async () => {
      prisma.usuario.findUnique.mockResolvedValue(
        user({ usuarioId: 'a1', rol: 'ADMINISTRADOR' }),
      );
      await expect(
        service.update('a1', { rol: 'MECANICO' }, ADMIN),
      ).rejects.toThrow(
        new BadRequestException('No puedes quitarte el rol de administrador'),
      );
    });

    it('deja que el administrador edite sus propios datos', async () => {
      prisma.usuario.findUnique.mockResolvedValue(
        user({ usuarioId: 'a1', rol: 'ADMINISTRADOR' }),
      );
      prisma.usuario.update.mockResolvedValue(user({ usuarioId: 'a1' }));

      await service.update(
        'a1',
        { nombre: 'Ana', rol: 'ADMINISTRADOR', activo: true },
        ADMIN,
      );

      expect(prisma.usuario.update).toHaveBeenCalled();
      expect(sessions.revokeAll).not.toHaveBeenCalled();
    });

    it('no degrada ni desactiva al último administrador activo', async () => {
      prisma.usuario.findUnique.mockResolvedValue(
        user({ usuarioId: 'a2', rol: 'ADMINISTRADOR' }),
      );
      prisma.usuario.count.mockResolvedValue(0);

      for (const change of [{ rol: 'MECANICO' }, { activo: false }]) {
        await expect(
          service.update('a2', change as never, ADMIN),
        ).rejects.toThrow(ConflictException);
      }
      expect(prisma.usuario.count).toHaveBeenCalledWith({
        where: { rol: 'ADMINISTRADOR', activo: true, NOT: { usuarioId: 'a2' } },
      });
      expect(prisma.usuario.update).not.toHaveBeenCalled();
    });

    it('al desactivar a alguien cierra sus sesiones', async () => {
      prisma.usuario.findUnique.mockResolvedValue(user());
      prisma.usuario.update.mockResolvedValue(user({ activo: false }));

      await service.update('u1', { activo: false }, ADMIN);

      expect(sessions.revokeAll).toHaveBeenCalledWith({ usuarioId: 'u1' });
    });

    it('al cambiarle el rol cierra sus sesiones, si queda otro administrador', async () => {
      prisma.usuario.findUnique.mockResolvedValue(
        user({ usuarioId: 'a2', rol: 'ADMINISTRADOR' }),
      );
      prisma.usuario.count.mockResolvedValue(1);
      prisma.usuario.update.mockResolvedValue(user({ usuarioId: 'a2' }));

      await service.update('a2', { rol: 'MECANICO' }, ADMIN);

      expect(sessions.revokeAll).toHaveBeenCalledWith({ usuarioId: 'a2' });
    });

    it('editar datos sin cambiar rol ni estado no cierra sesiones', async () => {
      prisma.usuario.findUnique.mockResolvedValue(user());
      prisma.usuario.update.mockResolvedValue(user());

      await service.update(
        'u1',
        { telefono: '987654321', rol: 'MECANICO', activo: true },
        ADMIN,
      );

      expect(prisma.usuario.count).not.toHaveBeenCalled();
      expect(sessions.revokeAll).not.toHaveBeenCalled();
    });

    it('traduce un correo repetido a un 409 claro', async () => {
      prisma.usuario.findUnique.mockResolvedValue(user());
      prisma.usuario.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicado', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.update('u1', { correo: 'otro@autofix.local' }, ADMIN),
      ).rejects.toThrow(
        new ConflictException('Ya existe un usuario con ese correo'),
      );
    });
  });

  describe('issueTemporaryPassword', () => {
    it('guarda una temporal nueva con la marca y cierra sus sesiones', async () => {
      prisma.usuario.findUnique.mockResolvedValue(user());
      prisma.usuario.update.mockResolvedValue(user());

      const result = await service.issueTemporaryPassword('u1');

      const { data } = prisma.usuario.update.mock.calls[0][0] as {
        data: { hashContrasena: string; debeCambiarContrasena: boolean };
      };
      expect(data.debeCambiarContrasena).toBe(true);
      expect(
        await argon2.verify(data.hashContrasena, result.contrasenaTemporal),
      ).toBe(true);
      expect(sessions.revokeAll).toHaveBeenCalledWith({ usuarioId: 'u1' });
    });

    it('responde 404 si el usuario no existe', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);
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
      expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
    });

    it('no borra a un usuario con historial, y dice por qué', async () => {
      prisma.usuario.findUnique.mockResolvedValue({
        rol: 'MECANICO',
        activo: true,
        _count: { ...NO_HISTORY, ordenesAsignadas: 2, eventosOrden: 1 },
      });
      await expect(service.remove('u1', ADMIN)).rejects.toThrow(
        new ConflictException(
          'No se puede eliminar: el usuario tiene 2 órdenes asignadas y 1 nota o cambio de estado en una orden. Puedes desactivarlo',
        ),
      );
      expect(prisma.usuario.delete).not.toHaveBeenCalled();
    });

    it('no borra al último administrador activo', async () => {
      prisma.usuario.findUnique.mockResolvedValue({
        rol: 'ADMINISTRADOR',
        activo: true,
        _count: NO_HISTORY,
      });
      prisma.usuario.count.mockResolvedValue(0);
      await expect(service.remove('a2', ADMIN)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.usuario.delete).not.toHaveBeenCalled();
    });

    it('borra de verdad a un usuario sin historial', async () => {
      prisma.usuario.findUnique.mockResolvedValue({
        rol: 'MECANICO',
        activo: false,
        _count: NO_HISTORY,
      });
      await service.remove('u1', ADMIN);
      expect(prisma.usuario.delete).toHaveBeenCalledWith({
        where: { usuarioId: 'u1' },
      });
    });

    it('responde 404 al borrar un usuario que no existe', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);
      await expect(service.remove('u1', ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
