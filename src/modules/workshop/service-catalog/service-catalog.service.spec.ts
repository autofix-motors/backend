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
    servicioId: 's1',
    nombre: 'Afinamiento',
    descripcion: null,
    precioManoObra: new Prisma.Decimal('180'),
    activo: true,
    ...overrides,
  };
}

describe('serviceCatalogWhere', () => {
  it('sin búsqueda ni filtros no restringe nada', () => {
    expect(serviceCatalogWhere({})).toEqual({ activo: undefined });
  });

  it('busca en el nombre y la descripción, sin distinguir mayúsculas', () => {
    expect(serviceCatalogWhere({ search: 'aceite', activo: true })).toEqual({
      activo: true,
      OR: [
        { nombre: { contains: 'aceite', mode: 'insensitive' } },
        { descripcion: { contains: 'aceite', mode: 'insensitive' } },
      ],
    });
  });

  it('filtra por un rango de precio, con los extremos incluidos', () => {
    expect(
      serviceCatalogWhere({ precioMinimo: '50', precioMaximo: '200' }),
    ).toEqual({
      activo: undefined,
      precioManoObra: { gte: '50', lte: '200' },
    });
    expect(serviceCatalogWhere({ precioMinimo: '100' }).precioManoObra).toEqual(
      {
        gte: '100',
        lte: undefined,
      },
    );
  });

  it('acepta un rango de un solo precio y rechaza uno invertido', () => {
    expect(() =>
      serviceCatalogWhere({ precioMinimo: '80', precioMaximo: '80.00' }),
    ).not.toThrow();
    expect(() =>
      serviceCatalogWhere({ precioMinimo: '200', precioMaximo: '50.5' }),
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
    servicio: {
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
    prisma.servicio.findMany.mockResolvedValue([item()]);
    prisma.servicio.count.mockResolvedValue(15);

    const page = await service.findAll({
      page: 2,
      pageSize: 10,
      ordenarPor: 'precioManoObra',
      sentido: 'desc',
    });

    expect(prisma.servicio.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ precioManoObra: 'desc' }, { servicioId: 'asc' }],
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
    prisma.servicio.findFirst.mockResolvedValue({
      servicioId: 's1',
    });
    await expect(
      service.create({ nombre: 'AFINAMIENTO', precioManoObra: '150' }),
    ).rejects.toThrow(DUPLICATE);
    expect(prisma.servicio.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { nombre: { equals: 'AFINAMIENTO', mode: 'insensitive' } },
      }),
    );
    expect(prisma.servicio.create).not.toHaveBeenCalled();
  });

  it('traduce el nombre repetido de la base (P2002) al mismo 409', async () => {
    prisma.servicio.findFirst.mockResolvedValue(null);
    prisma.servicio.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicado', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.create({ nombre: 'Afinamiento', precioManoObra: '150' }),
    ).rejects.toThrow(DUPLICATE);
  });

  it('al renombrar, el propio servicio no choca consigo mismo', async () => {
    prisma.servicio.findUnique.mockResolvedValue(item());
    prisma.servicio.findFirst.mockResolvedValue(null);
    prisma.servicio.update.mockResolvedValue(item());

    await service.update('s1', { nombre: 'afinamiento' });

    expect(prisma.servicio.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          nombre: { equals: 'afinamiento', mode: 'insensitive' },
          NOT: { servicioId: 's1' },
        },
      }),
    );
  });

  it('al editar sin cambiar el nombre no lo vuelve a comparar', async () => {
    prisma.servicio.findUnique.mockResolvedValue(item());
    prisma.servicio.update.mockResolvedValue(item());
    await service.update('s1', { precioManoObra: '200' });
    expect(prisma.servicio.findFirst).not.toHaveBeenCalled();
  });

  it('responde 404 al editar un servicio que no existe', async () => {
    prisma.servicio.findUnique.mockResolvedValue(null);
    await expect(service.update('s1', { activo: false })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.servicio.update).not.toHaveBeenCalled();
  });

  it('no borra un servicio usado en órdenes, y sugiere desactivarlo', async () => {
    prisma.servicio.findUnique.mockResolvedValue({
      _count: { detallesOrden: 3 },
    });
    await expect(service.remove('s1')).rejects.toThrow(
      new ConflictException(
        'No se puede eliminar: el servicio ya se usó en 3 detalles de órdenes de trabajo. Puedes desactivarlo para que deje de ofrecerse',
      ),
    );
    expect(prisma.servicio.delete).not.toHaveBeenCalled();
  });

  it('borra de verdad un servicio que nunca se usó', async () => {
    prisma.servicio.findUnique.mockResolvedValue({
      _count: { detallesOrden: 0 },
    });
    await service.remove('s1');
    expect(prisma.servicio.delete).toHaveBeenCalledWith({
      where: { servicioId: 's1' },
    });
  });

  it('responde 404 al borrar un servicio que no existe', async () => {
    prisma.servicio.findUnique.mockResolvedValue(null);
    await expect(service.remove('s1')).rejects.toThrow(NotFoundException);
  });
});
