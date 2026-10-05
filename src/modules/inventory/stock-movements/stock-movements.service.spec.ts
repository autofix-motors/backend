import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { ProductsService } from '../products/products.service.js';
import {
  StockMovementsService,
  stockMovementsWhere,
} from './stock-movements.service.js';

// Lo que se prueba es lo que decide: cómo se arman la búsqueda, los filtros y
// el rango de días de Lima, y que registrar un movimiento mueva el stock en la
// misma transacción, con el costo que corresponde.

const WITH_RELATIONS = {
  product: {
    select: { productId: true, code: true, name: true, unit: true },
  },
  createdBy: { select: { userId: true, name: true } },
};

describe('stockMovementsWhere', () => {
  it('sin búsqueda ni filtros no restringe nada', () => {
    expect(stockMovementsWhere({})).toEqual({
      type: undefined,
      productId: undefined,
      createdAt: undefined,
    });
  });

  it('busca en el código y el nombre del producto y en la nota', () => {
    const text = { contains: 'merma', mode: 'insensitive' };
    expect(stockMovementsWhere({ search: 'merma' }).OR).toEqual([
      { product: { code: text } },
      { product: { name: text } },
      { note: text },
    ]);
  });

  it('filtra por tipo y producto', () => {
    expect(
      stockMovementsWhere({ type: 'PURCHASE', productId: 'p1' }),
    ).toMatchObject({ type: 'PURCHASE', productId: 'p1' });
  });

  it('el rango son días de Lima, con el «hasta» inclusivo', () => {
    expect(
      stockMovementsWhere({ from: '2026-10-01', to: '2026-10-04' }).createdAt,
    ).toEqual({
      // Medianoche de Lima es las 05:00 UTC.
      gte: new Date('2026-10-01T05:00:00.000Z'),
      lt: new Date('2026-10-05T05:00:00.000Z'),
    });
  });

  it('acepta solo uno de los dos extremos', () => {
    expect(stockMovementsWhere({ from: '2026-10-01' }).createdAt).toEqual({
      gte: new Date('2026-10-01T05:00:00.000Z'),
    });
    expect(stockMovementsWhere({ to: '2026-10-04' }).createdAt).toEqual({
      lt: new Date('2026-10-05T05:00:00.000Z'),
    });
  });
});

describe('StockMovementsService', () => {
  const tx = { stockMovement: { create: vi.fn() } };
  const prisma = {
    $transaction: vi.fn((arg: unknown) =>
      // Con una lista, el listado; con una función, la transacción de un
      // registro, que recibe el cliente de la transacción.
      Array.isArray(arg)
        ? Promise.all(arg)
        : (arg as (client: typeof tx) => unknown)(tx),
    ),
    stockMovement: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  };
  const products = { applyStockChange: vi.fn() };
  const service = new StockMovementsService(
    prisma as unknown as PrismaService,
    products as unknown as ProductsService,
  );

  afterEach(() => vi.clearAllMocks());

  it('pagina el listado, lo más reciente primero, y desempata por el id', async () => {
    prisma.stockMovement.findMany.mockResolvedValue([]);
    prisma.stockMovement.count.mockResolvedValue(31);

    const page = await service.findAll({
      page: 2,
      pageSize: 10,
      type: 'ADJUSTMENT',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    const where = { type: 'ADJUSTMENT', productId: undefined };
    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith({
      where: { ...where, createdAt: undefined },
      include: WITH_RELATIONS,
      orderBy: [{ createdAt: 'desc' }, { stockMovementId: 'asc' }],
      skip: 10,
      take: 10,
    });
    expect(prisma.stockMovement.count).toHaveBeenCalledWith({
      where: { ...where, createdAt: undefined },
    });
    expect(page.meta).toEqual({
      page: 2,
      pageSize: 10,
      total: 31,
      totalPages: 4,
    });
  });

  it('rechaza un rango con el «desde» después del «hasta»', async () => {
    await expect(
      service.findAll({
        page: 1,
        pageSize: 10,
        from: '2026-10-05',
        to: '2026-10-01',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'La fecha desde no puede ser posterior a la fecha hasta',
      ),
    );
    expect(prisma.stockMovement.findMany).not.toHaveBeenCalled();
  });

  it('acepta un rango de un solo día', async () => {
    prisma.stockMovement.findMany.mockResolvedValue([]);
    prisma.stockMovement.count.mockResolvedValue(0);
    await service.findAll({
      page: 1,
      pageSize: 10,
      from: '2026-10-04',
      to: '2026-10-04',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    expect(prisma.stockMovement.findMany).toHaveBeenCalled();
  });

  it('responde 404 si el movimiento no existe', async () => {
    prisma.stockMovement.findUnique.mockResolvedValue(null);
    await expect(service.findOne('m1')).rejects.toThrow(
      new NotFoundException('No se encontró el movimiento'),
    );
  });

  it('una compra mueve el stock y crea el movimiento en la misma transacción, con el costo de la compra', async () => {
    products.applyStockChange.mockResolvedValue({
      cost: new Prisma.Decimal('13.80'),
    });
    const created = { stockMovementId: 'm1' };
    tx.stockMovement.create.mockResolvedValue(created);

    await expect(
      service.purchase(
        {
          productId: 'p1',
          quantity: '12',
          unitCost: '13.80',
          note: 'Factura F001-004512',
        },
        'u1',
      ),
    ).resolves.toBe(created);

    const change = {
      type: 'PURCHASE',
      productId: 'p1',
      quantity: '12',
      unitCost: '13.80',
      note: 'Factura F001-004512',
      createdById: 'u1',
    };
    expect(products.applyStockChange).toHaveBeenCalledWith(tx, change);
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: {
        productId: 'p1',
        type: 'PURCHASE',
        quantity: '12',
        unitCost: new Prisma.Decimal('13.80'),
        workOrderItemId: null,
        note: 'Factura F001-004512',
        createdById: 'u1',
      },
      include: WITH_RELATIONS,
    });
  });

  it('un ajuste guarda la cantidad con su signo y el costo vigente del producto', async () => {
    products.applyStockChange.mockResolvedValue({
      cost: new Prisma.Decimal('68'),
    });
    tx.stockMovement.create.mockResolvedValue({});

    await service.adjust(
      { productId: 'p1', quantity: '-1.50', note: 'Merma: envase roto' },
      'u1',
    );

    expect(products.applyStockChange).toHaveBeenCalledWith(tx, {
      type: 'ADJUSTMENT',
      productId: 'p1',
      quantity: '-1.50',
      note: 'Merma: envase roto',
      createdById: 'u1',
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'ADJUSTMENT',
        quantity: '-1.50',
        unitCost: new Prisma.Decimal('68'),
        note: 'Merma: envase roto',
      }) as unknown,
      include: WITH_RELATIONS,
    });
  });

  it('si el stock no alcanza, no crea el movimiento', async () => {
    products.applyStockChange.mockRejectedValue(
      new Error('Stock insuficiente: quedan 1.00 de FA-001'),
    );

    await expect(
      service.adjust(
        { productId: 'p1', quantity: '-5', note: 'Inventario físico' },
        'u1',
      ),
    ).rejects.toThrow('Stock insuficiente');
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('el consumo en una orden se registra en la transacción de la orden, con su ítem', async () => {
    products.applyStockChange.mockResolvedValue({
      cost: new Prisma.Decimal('18'),
    });
    tx.stockMovement.create.mockResolvedValue({});

    await service.record(tx as unknown as Prisma.TransactionClient, {
      type: 'WORK_ORDER',
      productId: 'p1',
      quantity: '-1',
      workOrderItemId: 'i1',
      createdById: 'u2',
    });

    // No abre otra transacción: usa la del llamador.
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: {
        productId: 'p1',
        type: 'WORK_ORDER',
        quantity: '-1',
        unitCost: new Prisma.Decimal('18'),
        workOrderItemId: 'i1',
        note: null,
        createdById: 'u2',
      },
      include: WITH_RELATIONS,
    });
  });
});
