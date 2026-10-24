import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { UsersService } from '../../core/users/users.service.js';
import { ToolsService, toolsWhere } from './tools.service.js';

// Lo que se prueba es lo que decide: cómo se arman la búsqueda y los filtros,
// el código repetido, a quién se puede asignar una herramienta según su estado
// y el del usuario, y que una herramienta en manos de alguien no se borre.

const WITH_ASSIGNEE = {
  assignedTo: { select: { userId: true, name: true } },
};

describe('toolsWhere', () => {
  it('sin búsqueda ni filtros no restringe nada', () => {
    expect(toolsWhere({})).toEqual({
      status: undefined,
      assignedToId: undefined,
    });
  });

  it('busca en el código, el nombre y la marca, sin distinguir mayúsculas', () => {
    const text = { contains: 'stanley', mode: 'insensitive' };
    expect(toolsWhere({ search: 'stanley' }).OR).toEqual([
      { code: text },
      { name: text },
      { brand: text },
    ]);
  });

  it('filtra por estado y por quién la tiene', () => {
    expect(toolsWhere({ status: 'IN_REPAIR', assignedToId: 'u1' })).toEqual({
      status: 'IN_REPAIR',
      assignedToId: 'u1',
    });
  });

  it('separa las asignadas de las que están en el almacén', () => {
    expect(toolsWhere({ isAssigned: true }).AND).toEqual([
      { assignedToId: { not: null } },
    ]);
    expect(toolsWhere({ isAssigned: false }).AND).toEqual([
      { assignedToId: null },
    ]);
  });
});

describe('ToolsService', () => {
  const prisma = {
    $transaction: vi.fn((queries: unknown[]) => Promise.all(queries)),
    tool: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const users = { findOne: vi.fn() };
  const service = new ToolsService(
    prisma as unknown as PrismaService,
    users as unknown as UsersService,
  );
  const tool = (overrides: Record<string, unknown> = {}) => ({
    toolId: 't1',
    status: 'AVAILABLE',
    assignedToId: null,
    ...overrides,
  });
  const p2002 = () =>
    new Prisma.PrismaClientKnownRequestError('duplicado', {
      code: 'P2002',
      clientVersion: 'test',
    });

  afterEach(() => vi.clearAllMocks());

  it('pagina el listado con quién la tiene y desempata el orden por el id', async () => {
    prisma.tool.findMany.mockResolvedValue([]);
    prisma.tool.count.mockResolvedValue(15);

    const page = await service.findAll({
      page: 2,
      pageSize: 10,
      status: 'AVAILABLE',
      sortBy: 'name',
      sortOrder: 'desc',
    });

    const where = { status: 'AVAILABLE', assignedToId: undefined };
    expect(prisma.tool.findMany).toHaveBeenCalledWith({
      where,
      include: WITH_ASSIGNEE,
      orderBy: [{ name: 'desc' }, { toolId: 'asc' }],
      skip: 10,
      take: 10,
    });
    expect(prisma.tool.count).toHaveBeenCalledWith({ where });
    expect(page.meta).toEqual({
      page: 2,
      pageSize: 10,
      total: 15,
      totalPages: 2,
    });
  });

  describe('create', () => {
    const valid = { code: 'HER-01', name: 'Gata hidráulica 3 t' };

    it('sin asignación la deja en el almacén, sin consultar usuarios', async () => {
      prisma.tool.create.mockResolvedValue(tool());
      await service.create(valid);
      expect(users.findOne).not.toHaveBeenCalled();
      expect(prisma.tool.create).toHaveBeenCalledWith({
        data: { ...valid, assignedToId: null },
        include: WITH_ASSIGNEE,
      });
    });

    it('la asigna a un usuario activo, verificado con UsersService', async () => {
      users.findOne.mockResolvedValue({ userId: 'u1', isActive: true });
      prisma.tool.create.mockResolvedValue(tool({ assignedToId: 'u1' }));
      await service.create({ ...valid, assignedToId: 'u1' });
      expect(users.findOne).toHaveBeenCalledWith('u1');
      expect(prisma.tool.create).toHaveBeenCalledWith({
        data: { ...valid, assignedToId: 'u1' },
        include: WITH_ASSIGNEE,
      });
    });

    it('no la asigna a un usuario inactivo', async () => {
      users.findOne.mockResolvedValue({ userId: 'u1', isActive: false });
      await expect(
        service.create({ ...valid, assignedToId: 'u1' }),
      ).rejects.toThrow(
        new BadRequestException(
          'El usuario está inactivo: no se le pueden asignar herramientas',
        ),
      );
      expect(prisma.tool.create).not.toHaveBeenCalled();
    });

    it('deja pasar el 404 de un usuario que no existe', async () => {
      users.findOne.mockRejectedValueOnce(
        new NotFoundException('No se encontró el usuario'),
      );
      await expect(
        service.create({ ...valid, assignedToId: 'u9' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.tool.create).not.toHaveBeenCalled();
    });

    it('no asigna una herramienta que nace en reparación o de baja', async () => {
      await expect(
        service.create({ ...valid, status: 'IN_REPAIR', assignedToId: 'u1' }),
      ).rejects.toThrow(
        'Una herramienta en reparación no se puede asignar: márcala como operativa cuando vuelva',
      );
      await expect(
        service.create({ ...valid, status: 'RETIRED', assignedToId: 'u1' }),
      ).rejects.toThrow('Una herramienta de baja no se puede asignar');
      expect(users.findOne).not.toHaveBeenCalled();
    });

    it('traduce el código repetido de la base (P2002) a un 409 propio', async () => {
      prisma.tool.create.mockRejectedValueOnce(p2002());
      await expect(service.create(valid)).rejects.toThrow(
        new ConflictException('Ya existe una herramienta con ese código'),
      );
    });
  });

  describe('update', () => {
    it('responde 404 si la herramienta no existe', async () => {
      prisma.tool.findUnique.mockResolvedValue(null);
      await expect(service.update('t1', { name: 'X' })).rejects.toThrow(
        new NotFoundException('No se encontró la herramienta'),
      );
      expect(prisma.tool.update).not.toHaveBeenCalled();
    });

    it('sin tocar la asignación la conserva, sin volver a verificar al usuario', async () => {
      prisma.tool.findUnique.mockResolvedValue(tool({ assignedToId: 'u1' }));
      await service.update('t1', { name: 'Gata de 3 t' });
      expect(users.findOne).not.toHaveBeenCalled();
      expect(prisma.tool.update).toHaveBeenCalledWith({
        where: { toolId: 't1' },
        data: { name: 'Gata de 3 t', assignedToId: 'u1' },
        include: WITH_ASSIGNEE,
      });
    });

    it('al darla de baja o mandarla a reparar vuelve sola al almacén', async () => {
      for (const status of ['RETIRED', 'IN_REPAIR'] as const) {
        prisma.tool.findUnique.mockResolvedValue(tool({ assignedToId: 'u1' }));
        await service.update('t1', { status });
        expect(prisma.tool.update).toHaveBeenLastCalledWith({
          where: { toolId: 't1' },
          data: { status, assignedToId: null },
          include: WITH_ASSIGNEE,
        });
      }
    });

    it('no asigna una herramienta que está de baja', async () => {
      prisma.tool.findUnique.mockResolvedValue(tool({ status: 'RETIRED' }));
      await expect(
        service.update('t1', { assignedToId: 'u1' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.tool.update).not.toHaveBeenCalled();
    });

    it('ni la deja asignada si en el mismo cambio pasa a reparación', async () => {
      prisma.tool.findUnique.mockResolvedValue(tool({ assignedToId: 'u1' }));
      await expect(
        service.update('t1', { status: 'IN_REPAIR', assignedToId: 'u1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('al volver a estar operativa sí se puede asignar', async () => {
      prisma.tool.findUnique.mockResolvedValue(tool({ status: 'IN_REPAIR' }));
      users.findOne.mockResolvedValue({ userId: 'u2', isActive: true });
      await service.update('t1', { status: 'AVAILABLE', assignedToId: 'u2' });
      expect(prisma.tool.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'AVAILABLE', assignedToId: 'u2' },
        }),
      );
    });

    it('traduce el código repetido a un 409 propio', async () => {
      prisma.tool.findUnique.mockResolvedValue(tool());
      prisma.tool.update.mockRejectedValueOnce(p2002());
      await expect(service.update('t1', { code: 'HER-02' })).rejects.toThrow(
        'Ya existe una herramienta con ese código',
      );
    });
  });

  describe('assign', () => {
    it('la entrega a otro usuario activo', async () => {
      prisma.tool.findUnique.mockResolvedValue(tool({ assignedToId: 'u1' }));
      users.findOne.mockResolvedValue({ userId: 'u2', isActive: true });
      await service.assign('t1', 'u2');
      expect(users.findOne).toHaveBeenCalledWith('u2');
      expect(prisma.tool.update).toHaveBeenCalledWith({
        where: { toolId: 't1' },
        data: { assignedToId: 'u2' },
        include: WITH_ASSIGNEE,
      });
    });

    it('la devuelve al almacén', async () => {
      prisma.tool.findUnique.mockResolvedValue(tool({ assignedToId: 'u1' }));
      await service.assign('t1', null);
      expect(users.findOne).not.toHaveBeenCalled();
      expect(prisma.tool.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { assignedToId: null } }),
      );
    });

    it('no entrega una herramienta en reparación', async () => {
      prisma.tool.findUnique.mockResolvedValue(tool({ status: 'IN_REPAIR' }));
      await expect(service.assign('t1', 'u1')).rejects.toThrow(
        'Una herramienta en reparación no se puede asignar: márcala como operativa cuando vuelva',
      );
    });
  });

  describe('remove', () => {
    it('no borra una herramienta que alguien tiene, y dice quién', async () => {
      prisma.tool.findUnique.mockResolvedValue({
        assignedTo: { name: 'Jorge Quispe' },
      });
      await expect(service.remove('t1')).rejects.toThrow(
        new ConflictException(
          'No se puede eliminar: la tiene Jorge Quispe. Primero devuélvela al almacén',
        ),
      );
      expect(prisma.tool.delete).not.toHaveBeenCalled();
    });

    it('borra de verdad una herramienta que está en el almacén', async () => {
      prisma.tool.findUnique.mockResolvedValue({ assignedTo: null });
      await service.remove('t1');
      expect(prisma.tool.delete).toHaveBeenCalledWith({
        where: { toolId: 't1' },
      });
    });

    it('responde 404 al borrar una herramienta que no existe', async () => {
      prisma.tool.findUnique.mockResolvedValue(null);
      await expect(service.remove('t1')).rejects.toThrow(NotFoundException);
    });
  });
});
