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
  producto: {
    select: { productoId: true, codigo: true, nombre: true, unidad: true },
  },
  creadoPor: { select: { usuarioId: true, nombre: true } },
};

describe('stockMovementsWhere', () => {
  it('sin búsqueda ni filtros no restringe nada', () => {
    expect(stockMovementsWhere({})).toEqual({
      tipo: undefined,
      productoId: undefined,
      creadoEn: undefined,
    });
  });

  it('busca en el código y el nombre del producto y en la nota', () => {
    const text = { contains: 'merma', mode: 'insensitive' };
    expect(stockMovementsWhere({ search: 'merma' }).OR).toEqual([
      { producto: { codigo: text } },
      { producto: { nombre: text } },
      { nota: text },
    ]);
  });

  it('filtra por tipo y producto', () => {
    expect(
      stockMovementsWhere({ tipo: 'COMPRA', productoId: 'p1' }),
    ).toMatchObject({ tipo: 'COMPRA', productoId: 'p1' });
  });

  it('el rango son días de Lima, con el «hasta» inclusivo', () => {
    expect(
      stockMovementsWhere({ desde: '2026-10-01', hasta: '2026-10-04' })
        .creadoEn,
    ).toEqual({
      // Medianoche de Lima es las 05:00 UTC.
      gte: new Date('2026-10-01T05:00:00.000Z'),
      lt: new Date('2026-10-05T05:00:00.000Z'),
    });
  });

  it('acepta solo uno de los dos extremos', () => {
    expect(stockMovementsWhere({ desde: '2026-10-01' }).creadoEn).toEqual({
      gte: new Date('2026-10-01T05:00:00.000Z'),
    });
    expect(stockMovementsWhere({ hasta: '2026-10-04' }).creadoEn).toEqual({
      lt: new Date('2026-10-05T05:00:00.000Z'),
    });
  });
});

describe('StockMovementsService', () => {
  const tx = { movimientoStock: { create: vi.fn() } };
  const prisma = {
    $transaction: vi.fn((arg: unknown) =>
      // Con una lista, el listado; con una función, la transacción de un
      // registro, que recibe el cliente de la transacción.
      Array.isArray(arg)
        ? Promise.all(arg)
        : (arg as (client: typeof tx) => unknown)(tx),
    ),
    movimientoStock: {
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
    prisma.movimientoStock.findMany.mockResolvedValue([]);
    prisma.movimientoStock.count.mockResolvedValue(31);

    const page = await service.findAll({
      page: 2,
      pageSize: 10,
      tipo: 'AJUSTE',
      ordenarPor: 'creadoEn',
      sentido: 'desc',
    });

    const where = { tipo: 'AJUSTE', productoId: undefined };
    expect(prisma.movimientoStock.findMany).toHaveBeenCalledWith({
      where: { ...where, creadoEn: undefined },
      include: WITH_RELATIONS,
      orderBy: [{ creadoEn: 'desc' }, { movimientoStockId: 'asc' }],
      skip: 10,
      take: 10,
    });
    expect(prisma.movimientoStock.count).toHaveBeenCalledWith({
      where: { ...where, creadoEn: undefined },
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
        desde: '2026-10-05',
        hasta: '2026-10-01',
        ordenarPor: 'creadoEn',
        sentido: 'desc',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'La fecha desde no puede ser posterior a la fecha hasta',
      ),
    );
    expect(prisma.movimientoStock.findMany).not.toHaveBeenCalled();
  });

  it('acepta un rango de un solo día', async () => {
    prisma.movimientoStock.findMany.mockResolvedValue([]);
    prisma.movimientoStock.count.mockResolvedValue(0);
    await service.findAll({
      page: 1,
      pageSize: 10,
      desde: '2026-10-04',
      hasta: '2026-10-04',
      ordenarPor: 'creadoEn',
      sentido: 'desc',
    });
    expect(prisma.movimientoStock.findMany).toHaveBeenCalled();
  });

  it('responde 404 si el movimiento no existe', async () => {
    prisma.movimientoStock.findUnique.mockResolvedValue(null);
    await expect(service.findOne('m1')).rejects.toThrow(
      new NotFoundException('No se encontró el movimiento'),
    );
  });

  it('una compra mueve el stock y crea el movimiento en la misma transacción, con el costo de la compra', async () => {
    products.applyStockChange.mockResolvedValue({
      costo: new Prisma.Decimal('13.80'),
    });
    const created = { movimientoStockId: 'm1' };
    tx.movimientoStock.create.mockResolvedValue(created);

    await expect(
      service.purchase(
        {
          productoId: 'p1',
          cantidad: '12',
          costoUnitario: '13.80',
          nota: 'Factura F001-004512',
        },
        'u1',
      ),
    ).resolves.toBe(created);

    const change = {
      tipo: 'COMPRA',
      productoId: 'p1',
      cantidad: '12',
      costoUnitario: '13.80',
      nota: 'Factura F001-004512',
      creadoPorId: 'u1',
    };
    expect(products.applyStockChange).toHaveBeenCalledWith(tx, change);
    expect(tx.movimientoStock.create).toHaveBeenCalledWith({
      data: {
        productoId: 'p1',
        tipo: 'COMPRA',
        cantidad: '12',
        costoUnitario: new Prisma.Decimal('13.80'),
        detalleOrdenId: null,
        nota: 'Factura F001-004512',
        creadoPorId: 'u1',
      },
      include: WITH_RELATIONS,
    });
  });

  it('un ajuste guarda la cantidad con su signo y el costo vigente del producto', async () => {
    products.applyStockChange.mockResolvedValue({
      costo: new Prisma.Decimal('68'),
    });
    tx.movimientoStock.create.mockResolvedValue({});

    await service.adjust(
      { productoId: 'p1', cantidad: '-1.50', nota: 'Merma: envase roto' },
      'u1',
    );

    expect(products.applyStockChange).toHaveBeenCalledWith(tx, {
      tipo: 'AJUSTE',
      productoId: 'p1',
      cantidad: '-1.50',
      nota: 'Merma: envase roto',
      creadoPorId: 'u1',
    });
    expect(tx.movimientoStock.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: 'AJUSTE',
        cantidad: '-1.50',
        costoUnitario: new Prisma.Decimal('68'),
        nota: 'Merma: envase roto',
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
        { productoId: 'p1', cantidad: '-5', nota: 'Inventario físico' },
        'u1',
      ),
    ).rejects.toThrow('Stock insuficiente');
    expect(tx.movimientoStock.create).not.toHaveBeenCalled();
  });

  it('el consumo en una orden se registra en la transacción de la orden, con su detalle', async () => {
    products.applyStockChange.mockResolvedValue({
      costo: new Prisma.Decimal('18'),
    });
    tx.movimientoStock.create.mockResolvedValue({});

    await service.record(tx as unknown as Prisma.TransactionClient, {
      tipo: 'ORDEN_TRABAJO',
      productoId: 'p1',
      cantidad: '-1',
      detalleOrdenId: 'i1',
      creadoPorId: 'u2',
    });

    // No abre otra transacción: usa la del llamador.
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.movimientoStock.create).toHaveBeenCalledWith({
      data: {
        productoId: 'p1',
        tipo: 'ORDEN_TRABAJO',
        cantidad: '-1',
        costoUnitario: new Prisma.Decimal('18'),
        detalleOrdenId: 'i1',
        nota: null,
        creadoPorId: 'u2',
      },
      include: WITH_RELATIONS,
    });
  });

  it('la devolución de un detalle quitado entra como ORDEN_TRABAJO, sin detalle y con su nota', async () => {
    products.applyStockChange.mockResolvedValue({
      costo: new Prisma.Decimal('18'),
    });
    tx.movimientoStock.create.mockResolvedValue({});

    await service.record(tx as unknown as Prisma.TransactionClient, {
      tipo: 'ORDEN_TRABAJO',
      productoId: 'p1',
      cantidad: '2',
      detalleOrdenId: null,
      nota: 'Devolución: ítem quitado de OT-000123',
      creadoPorId: 'u2',
    });

    // ORDEN_TRABAJO: `applyStockChange` no exige el producto activo, así que un
    // repuesto desactivado después de usarse se puede devolver.
    expect(products.applyStockChange).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ tipo: 'ORDEN_TRABAJO', cantidad: '2' }),
    );
    expect(tx.movimientoStock.create.mock.calls[0][0].data).toMatchObject({
      tipo: 'ORDEN_TRABAJO',
      cantidad: '2',
      detalleOrdenId: null,
      nota: 'Devolución: ítem quitado de OT-000123',
    });
  });
});
