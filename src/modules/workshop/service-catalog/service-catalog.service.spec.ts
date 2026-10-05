import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  ServiceCatalogService,
  serviceCatalogWhere,
} from './service-catalog.service.js';

// Lo que se prueba es lo que decide: cómo se arman la búsqueda y el rango de
// precio, el nombre repetido sin distinguir mayúsculas y que un servicio usado
// en órdenes no se borre.

function item(overrides: Record<string, unknown> = {}) {
  return {
    serviceCatalogItemId: 's1',
    name: 'Afinamiento',
    description: null,
    laborPrice: new Prisma.Decimal('180'),
    isActive: true,
    ...overrides,
  };
}

describe('serviceCatalogWhere', () => {
  it('sin búsqueda ni filtros no restringe nada', () => {
    expect(serviceCatalogWhere({})).toEqual({ isActive: undefined });
  });

  it('busca en el nombre y la descripción, sin distinguir mayúsculas', () => {
    expect(serviceCatalogWhere({ search: 'aceite', isActive: true })).toEqual({
      isActive: true,
      OR: [
        { name: { contains: 'aceite', mode: 'insensitive' } },
        { description: { contains: 'aceite', mode: 'insensitive' } },
      ],
    });
  });

  it('filtra por un rango de precio, con los extremos incluidos', () => {
    expect(serviceCatalogWhere({ minPrice: '50', maxPrice: '200' })).toEqual({
      isActive: undefined,
      laborPrice: { gte: '50', lte: '200' },
    });
    expect(serviceCatalogWhere({ minPrice: '100' }).laborPrice).toEqual({
      gte: '100',
      lte: undefined,
    });
  });

  it('acepta un rango de un solo precio y rechaza uno invertido', () => {
    expect(() =>
      serviceCatalogWhere({ minPrice: '80', maxPrice: '80.00' }),
    ).not.toThrow();
    expect(() =>
      serviceCatalogWhere({ minPrice: '200', maxPrice: '50.5' }),
    ).toThrow(
      new BadRequestException(
        'El precio mínimo no puede ser mayor que el máximo',
      ),
    );
  });
});

describe('ServiceCatalogService', () => {
  const prisma = {
    $transaction: vi.fn((queries: unknown[]) => Promise.all(queries)),
    serviceCatalogItem: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const service = new ServiceCatalogService(prisma as unknown as PrismaService);
  const DUPLICATE = new ConflictException(
    'Ya existe un servicio con ese nombre',
  );

  afterEach(() => vi.clearAllMocks());

  it('pagina el listado y desempata el orden por el id', async () => {
    prisma.serviceCatalogItem.findMany.mockResolvedValue([item()]);
    prisma.serviceCatalogItem.count.mockResolvedValue(15);

    const page = await service.findAll({
      page: 2,
      pageSize: 10,
      sortBy: 'laborPrice',
      sortOrder: 'desc',
    });

    expect(prisma.serviceCatalogItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ laborPrice: 'desc' }, { serviceCatalogItemId: 'asc' }],
        skip: 10,
        take: 10,
      }),
    );
    expect(page.meta).toEqual({
      page: 2,
      pageSize: 10,
      total: 15,
      totalPages: 2,
    });
  });

  it('no registra un nombre que ya existe con otras mayúsculas', async () => {
    prisma.serviceCatalogItem.findFirst.mockResolvedValue({
      serviceCatalogItemId: 's1',
    });
    await expect(
      service.create({ name: 'AFINAMIENTO', laborPrice: '150' }),
    ).rejects.toThrow(DUPLICATE);
    expect(prisma.serviceCatalogItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { equals: 'AFINAMIENTO', mode: 'insensitive' } },
      }),
    );
    expect(prisma.serviceCatalogItem.create).not.toHaveBeenCalled();
  });

  it('traduce el nombre repetido de la base (P2002) al mismo 409', async () => {
    prisma.serviceCatalogItem.findFirst.mockResolvedValue(null);
    prisma.serviceCatalogItem.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicado', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.create({ name: 'Afinamiento', laborPrice: '150' }),
    ).rejects.toThrow(DUPLICATE);
  });

  it('al renombrar, el propio servicio no choca consigo mismo', async () => {
    prisma.serviceCatalogItem.findUnique.mockResolvedValue(item());
    prisma.serviceCatalogItem.findFirst.mockResolvedValue(null);
    prisma.serviceCatalogItem.update.mockResolvedValue(item());

    await service.update('s1', { name: 'afinamiento' });

    expect(prisma.serviceCatalogItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          name: { equals: 'afinamiento', mode: 'insensitive' },
          NOT: { serviceCatalogItemId: 's1' },
        },
      }),
    );
  });

  it('al editar sin cambiar el nombre no lo vuelve a comparar', async () => {
    prisma.serviceCatalogItem.findUnique.mockResolvedValue(item());
    prisma.serviceCatalogItem.update.mockResolvedValue(item());
    await service.update('s1', { laborPrice: '200' });
    expect(prisma.serviceCatalogItem.findFirst).not.toHaveBeenCalled();
  });

  it('responde 404 al editar un servicio que no existe', async () => {
    prisma.serviceCatalogItem.findUnique.mockResolvedValue(null);
    await expect(service.update('s1', { isActive: false })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.serviceCatalogItem.update).not.toHaveBeenCalled();
  });

  it('no borra un servicio usado en órdenes, y sugiere desactivarlo', async () => {
    prisma.serviceCatalogItem.findUnique.mockResolvedValue({
      _count: { workOrderItems: 3 },
    });
    await expect(service.remove('s1')).rejects.toThrow(
      new ConflictException(
        'No se puede eliminar: el servicio ya se usó en 3 ítems de órdenes de trabajo. Puedes desactivarlo para que deje de ofrecerse',
      ),
    );
    expect(prisma.serviceCatalogItem.delete).not.toHaveBeenCalled();
  });

  it('borra de verdad un servicio que nunca se usó', async () => {
    prisma.serviceCatalogItem.findUnique.mockResolvedValue({
      _count: { workOrderItems: 0 },
    });
    await service.remove('s1');
    expect(prisma.serviceCatalogItem.delete).toHaveBeenCalledWith({
      where: { serviceCatalogItemId: 's1' },
    });
  });

  it('responde 404 al borrar un servicio que no existe', async () => {
    prisma.serviceCatalogItem.findUnique.mockResolvedValue(null);
    await expect(service.remove('s1')).rejects.toThrow(NotFoundException);
  });
});
