import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import type { SessionsService } from '../../core/sessions/sessions.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { CustomersService, customersWhere } from './customers.service.js';

// Lo que se prueba es lo que decide: cómo se arma la búsqueda, qué pasa con un
// documento repetido o que no corresponde a su tipo, y que un cliente con
// historial no se borre.

function customer(overrides: Record<string, unknown> = {}) {
  return {
    clienteId: 'c1',
    tipoDocumento: 'DNI',
    numeroDocumento: '45678912',
    nombre: 'Juan Pérez',
    _count: { vehiculos: 0 },
    ...overrides,
  };
}

describe('customersWhere', () => {
  it('sin búsqueda ni filtros no restringe nada', () => {
    expect(customersWhere({})).toEqual({
      tipoDocumento: undefined,
      activo: undefined,
    });
  });

  it('busca en el nombre y en el número, este sin separadores', () => {
    const where = customersWhere({ search: '20-123', activo: true });
    expect(where.activo).toBe(true);
    expect(where.OR).toEqual([
      { nombre: { contains: '20-123', mode: 'insensitive' } },
      { numeroDocumento: { contains: '20123', mode: 'insensitive' } },
    ]);
  });
});

describe('CustomersService', () => {
  const prisma = {
    $transaction: vi.fn((queries: unknown[]) => Promise.all(queries)),
    cliente: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const sessions = { revokeAllForCustomer: vi.fn() };
  const service = new CustomersService(
    prisma as unknown as PrismaService,
    sessions as unknown as SessionsService,
  );

  afterEach(() => vi.clearAllMocks());

  it('pagina el listado y calcula el total de páginas', async () => {
    prisma.cliente.findMany.mockResolvedValue([customer()]);
    prisma.cliente.count.mockResolvedValue(23);

    const page = await service.findAll({
      page: 3,
      pageSize: 10,
      ordenarPor: 'nombre',
      sentido: 'asc',
    });

    expect(prisma.cliente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
    expect(page.meta).toEqual({
      page: 3,
      pageSize: 10,
      total: 23,
      totalPages: 3,
    });
  });

  it('traduce un documento repetido a un 409 claro', async () => {
    prisma.cliente.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicado', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.create({
        tipoDocumento: 'DNI',
        numeroDocumento: '45678912',
        nombre: 'Juan',
        telefono: '987654321',
      }),
    ).rejects.toThrow(
      new ConflictException(
        'Ya existe un cliente con ese tipo y número de documento',
      ),
    );
  });

  it('al editar solo el tipo, valida el número guardado contra el tipo nuevo', async () => {
    prisma.cliente.findUnique.mockResolvedValue(customer());
    await expect(
      service.update('c1', { tipoDocumento: 'RUC' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.cliente.update).not.toHaveBeenCalled();
  });

  it('al desactivarlo cierra sus sesiones del portal; al editar otra cosa, no', async () => {
    prisma.cliente.findUnique.mockResolvedValue(customer({ activo: true }));
    prisma.cliente.update.mockResolvedValue(customer({ activo: false }));

    await service.update('c1', { activo: false });
    expect(sessions.revokeAllForCustomer).toHaveBeenCalledWith('c1');

    sessions.revokeAllForCustomer.mockClear();
    await service.update('c1', { nombre: 'Juan P.' });
    expect(sessions.revokeAllForCustomer).not.toHaveBeenCalled();
  });

  it('busca candidatos del login solo entre clientes con acceso al portal', async () => {
    prisma.cliente.findMany.mockResolvedValue([]);

    await service.findLoginCandidates({ tipo: 'documento', valor: '45678912' });
    expect(prisma.cliente.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { cuentaCliente: { isNot: null }, numeroDocumento: '45678912' },
        take: 5,
      }),
    );

    await service.findLoginCandidates({ tipo: 'correo', valor: 'a@b.pe' });
    expect(prisma.cliente.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { cuentaCliente: { isNot: null }, correo: 'a@b.pe' },
      }),
    );
  });

  it('no borra un cliente con vehículos u órdenes, y dice por qué', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
      _count: { vehiculos: 2, ordenes: 1 },
    });
    await expect(service.remove('c1')).rejects.toThrow(
      new ConflictException(
        'No se puede eliminar: el cliente tiene 2 vehículos y 1 orden de trabajo. Puedes desactivarlo',
      ),
    );
    expect(prisma.cliente.delete).not.toHaveBeenCalled();
  });

  it('borra de verdad un cliente sin historial', async () => {
    prisma.cliente.findUnique.mockResolvedValue({
      _count: { vehiculos: 0, ordenes: 0 },
    });
    await service.remove('c1');
    expect(prisma.cliente.delete).toHaveBeenCalledWith({
      where: { clienteId: 'c1' },
    });
  });

  it('responde 404 al borrar un cliente que no existe', async () => {
    prisma.cliente.findUnique.mockResolvedValue(null);
    await expect(service.remove('c1')).rejects.toThrow(NotFoundException);
  });
});
