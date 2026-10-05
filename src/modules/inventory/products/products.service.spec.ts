import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { ProductsService, productsWhere } from './products.service.js';

// Lo que se prueba es lo que decide: cómo se arman la búsqueda y los filtros
// (el stock bajo compara dos columnas), el código repetido y que un producto
// con historial no se borre.

// En los tests basta un marcador: lo que importa es que el filtro use la
// referencia a la columna y no un valor.
const MIN_STOCK = 'minStock-column' as unknown as Prisma.FieldRef<
  'Product',
  'Decimal'
>;

const valid = {
  code: 'FA-001',
  name: 'Filtro de aceite',
  kind: 'PART' as const,
  unit: 'UNIT' as const,
  minStock: '4',
  cost: '12.50',
  price: '25',
};

describe('productsWhere', () => {
  it('sin búsqueda ni filtros no restringe nada', () => {
    expect(productsWhere({}, MIN_STOCK)).toEqual({
      kind: undefined,
      isActive: undefined,
    });
  });

  it('busca en el código, el nombre y la marca, sin distinguir mayúsculas', () => {
    const text = { contains: 'bosch', mode: 'insensitive' };
    expect(productsWhere({ search: 'bosch' }, MIN_STOCK).OR).toEqual([
      { code: text },
      { name: text },
      { brand: text },
    ]);
  });

  it('filtra por tipo y estado', () => {
    expect(
      productsWhere({ kind: 'SUPPLY', isActive: false }, MIN_STOCK),
    ).toEqual({ kind: 'SUPPLY', isActive: false });
  });

  it('el stock bajo compara el stock con el mínimo de la misma fila', () => {
    expect(productsWhere({ lowStock: true }, MIN_STOCK).stock).toEqual({
      lte: MIN_STOCK,
    });
    expect(productsWhere({ lowStock: false }, MIN_STOCK).stock).toEqual({
      gt: MIN_STOCK,
    });
  });
});

describe('ProductsService', () => {
  const prisma = {
    $transaction: vi.fn((queries: unknown[]) => Promise.all(queries)),
    product: {
      fields: { minStock: MIN_STOCK },
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const service = new ProductsService(prisma as unknown as PrismaService);
  const DUPLICATE = new ConflictException(
    'Ya existe un producto con ese código',
  );
  const p2002 = () =>
    new Prisma.PrismaClientKnownRequestError('duplicado', {
      code: 'P2002',
      clientVersion: 'test',
    });

  afterEach(() => vi.clearAllMocks());

  it('pagina el listado, filtra el stock bajo y desempata el orden por el id', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(25);

    const page = await service.findAll({
      page: 3,
      pageSize: 10,
      lowStock: true,
      sortBy: 'stock',
      sortOrder: 'asc',
    });

    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: {
        kind: undefined,
        isActive: undefined,
        stock: { lte: MIN_STOCK },
      },
      orderBy: [{ stock: 'asc' }, { productId: 'asc' }],
      skip: 20,
      take: 10,
    });
    expect(prisma.product.count).toHaveBeenCalledWith({
      where: {
        kind: undefined,
        isActive: undefined,
        stock: { lte: MIN_STOCK },
      },
    });
    expect(page.meta).toEqual({
      page: 3,
      pageSize: 10,
      total: 25,
      totalPages: 3,
    });
  });

  it('traduce el código repetido de la base (P2002) a un 409 propio', async () => {
    prisma.product.create.mockRejectedValue(p2002());
    await expect(service.create(valid)).rejects.toThrow(DUPLICATE);
  });

  it('también al cambiarle el código a uno que ya existe', async () => {
    prisma.product.findUnique.mockResolvedValue({ productId: 'p1' });
    prisma.product.update.mockRejectedValue(p2002());
    await expect(service.update('p1', { code: 'FA-002' })).rejects.toThrow(
      DUPLICATE,
    );
  });

  it('responde 404 al editar un producto que no existe', async () => {
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(service.update('p1', { isActive: false })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('no borra un producto con movimientos ni ítems de órdenes, y dice por qué', async () => {
    prisma.product.findUnique.mockResolvedValue({
      _count: { movements: 3, workOrderItems: 1 },
    });
    await expect(service.remove('p1')).rejects.toThrow(
      new ConflictException(
        'No se puede eliminar: el producto tiene historial (3 movimientos de stock y 1 ítem de órdenes de trabajo). Puedes desactivarlo para que deje de ofrecerse',
      ),
    );
    expect(prisma.product.delete).not.toHaveBeenCalled();
  });

  it('nombra solo el historial que tiene', async () => {
    prisma.product.findUnique.mockResolvedValue({
      _count: { movements: 1, workOrderItems: 0 },
    });
    await expect(service.remove('p1')).rejects.toThrow(
      'No se puede eliminar: el producto tiene historial (1 movimiento de stock). Puedes desactivarlo para que deje de ofrecerse',
    );
  });

  it('borra de verdad un producto sin historial', async () => {
    prisma.product.findUnique.mockResolvedValue({
      _count: { movements: 0, workOrderItems: 0 },
    });
    await service.remove('p1');
    expect(prisma.product.delete).toHaveBeenCalledWith({
      where: { productId: 'p1' },
    });
  });

  it('responde 404 al borrar un producto que no existe', async () => {
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(service.remove('p1')).rejects.toThrow(NotFoundException);
  });
});
