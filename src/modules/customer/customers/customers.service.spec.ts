import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { CustomersService, customersWhere } from './customers.service.js';

// Lo que se prueba es lo que decide: cómo se arma la búsqueda, qué pasa con un
// documento repetido o que no corresponde a su tipo, y que un cliente con
// historial no se borre.

function customer(overrides: Record<string, unknown> = {}) {
  return {
    customerId: 'c1',
    documentType: 'DNI',
    documentNumber: '45678912',
    name: 'Juan Pérez',
    _count: { vehicles: 0 },
    ...overrides,
  };
}

describe('customersWhere', () => {
  it('sin búsqueda ni filtros no restringe nada', () => {
    expect(customersWhere({})).toEqual({
      documentType: undefined,
      isActive: undefined,
    });
  });

  it('busca en el nombre y en el número, este sin separadores', () => {
    const where = customersWhere({ search: '20-123', isActive: true });
    expect(where.isActive).toBe(true);
    expect(where.OR).toEqual([
      { name: { contains: '20-123', mode: 'insensitive' } },
      { documentNumber: { contains: '20123', mode: 'insensitive' } },
    ]);
  });
});

describe('CustomersService', () => {
  const prisma = {
    $transaction: vi.fn((queries: unknown[]) => Promise.all(queries)),
    customer: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const service = new CustomersService(prisma as unknown as PrismaService);

  afterEach(() => vi.clearAllMocks());

  it('pagina el listado y calcula el total de páginas', async () => {
    prisma.customer.findMany.mockResolvedValue([customer()]);
    prisma.customer.count.mockResolvedValue(23);

    const page = await service.findAll({
      page: 3,
      pageSize: 10,
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(prisma.customer.findMany).toHaveBeenCalledWith(
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
    prisma.customer.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicado', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.create({
        documentType: 'DNI',
        documentNumber: '45678912',
        name: 'Juan',
        phone: '987654321',
      }),
    ).rejects.toThrow(
      new ConflictException(
        'Ya existe un cliente con ese tipo y número de documento',
      ),
    );
  });

  it('al editar solo el tipo, valida el número guardado contra el tipo nuevo', async () => {
    prisma.customer.findUnique.mockResolvedValue(customer());
    await expect(service.update('c1', { documentType: 'RUC' })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('no borra un cliente con vehículos u órdenes, y dice por qué', async () => {
    prisma.customer.findUnique.mockResolvedValue({
      _count: { vehicles: 2, workOrders: 1 },
    });
    await expect(service.remove('c1')).rejects.toThrow(
      new ConflictException(
        'No se puede eliminar: el cliente tiene 2 vehículos y 1 orden de trabajo. Puedes desactivarlo',
      ),
    );
    expect(prisma.customer.delete).not.toHaveBeenCalled();
  });

  it('borra de verdad un cliente sin historial', async () => {
    prisma.customer.findUnique.mockResolvedValue({
      _count: { vehicles: 0, workOrders: 0 },
    });
    await service.remove('c1');
    expect(prisma.customer.delete).toHaveBeenCalledWith({
      where: { customerId: 'c1' },
    });
  });

  it('responde 404 al borrar un cliente que no existe', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(service.remove('c1')).rejects.toThrow(NotFoundException);
  });
});
