import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  ProductsService,
  productsWhere,
  type StockChange,
} from './products.service.js';

// Lo que se prueba es lo que decide: cómo se arman la búsqueda y los filtros
// (el stock bajo compara dos columnas), el código repetido, que un producto
// con historial no se borre y cómo un movimiento cambia el stock sin dejarlo
// negativo.

// En los tests basta un marcador: lo que importa es que el filtro use la
// referencia a la columna y no un valor.
const MIN_STOCK = 'stockMinimo-column' as unknown as Prisma.FieldRef<
  'Producto',
  'Decimal'
>;

const valid = {
  codigo: 'FA-001',
  nombre: 'Filtro de aceite',
  tipo: 'REPUESTO' as const,
  unidad: 'UNIDAD' as const,
  stockMinimo: '4',
  costo: '12.50',
  precio: '25',
};

describe('productsWhere', () => {
  it('sin búsqueda ni filtros no restringe nada', () => {
    expect(productsWhere({}, MIN_STOCK)).toEqual({
      tipo: undefined,
      activo: undefined,
    });
  });

  it('busca en el código, el nombre y la marca, sin distinguir mayúsculas', () => {
    const text = { contains: 'bosch', mode: 'insensitive' };
    expect(productsWhere({ search: 'bosch' }, MIN_STOCK).OR).toEqual([
      { codigo: text },
      { nombre: text },
      { marca: text },
    ]);
  });

  it('filtra por tipo y estado', () => {
    expect(productsWhere({ tipo: 'INSUMO', activo: false }, MIN_STOCK)).toEqual(
      { tipo: 'INSUMO', activo: false },
    );
  });

  it('el stock bajo compara el stock con el mínimo de la misma fila', () => {
    expect(productsWhere({ stockBajo: true }, MIN_STOCK).stock).toEqual({
      lte: MIN_STOCK,
    });
    expect(productsWhere({ stockBajo: false }, MIN_STOCK).stock).toEqual({
      gt: MIN_STOCK,
    });
  });
});

describe('ProductsService', () => {
  const prisma = {
    $transaction: vi.fn((queries: unknown[]) => Promise.all(queries)),
    producto: {
      fields: { stockMinimo: MIN_STOCK },
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
    prisma.producto.findMany.mockResolvedValue([]);
    prisma.producto.count.mockResolvedValue(25);

    const page = await service.findAll({
      page: 3,
      pageSize: 10,
      stockBajo: true,
      ordenarPor: 'stock',
      sentido: 'asc',
    });

    expect(prisma.producto.findMany).toHaveBeenCalledWith({
      where: {
        tipo: undefined,
        activo: undefined,
        stock: { lte: MIN_STOCK },
      },
      orderBy: [{ stock: 'asc' }, { productoId: 'asc' }],
      skip: 20,
      take: 10,
    });
    expect(prisma.producto.count).toHaveBeenCalledWith({
      where: {
        tipo: undefined,
        activo: undefined,
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

  it('el stock bajo trae los activos bajo su mínimo, los que más les falta primero', async () => {
    const low = (nombre: string, stock: string, stockMinimo: string) => ({
      productoId: nombre,
      codigo: nombre.toUpperCase(),
      nombre,
      unidad: 'UNIDAD',
      stock: new Prisma.Decimal(stock),
      stockMinimo: new Prisma.Decimal(stockMinimo),
    });
    prisma.producto.findMany.mockResolvedValue([
      low('pastillas', '3', '4'), // le falta 1
      low('aceite', '0', '6'), // le falta 6
      low('bujias', '2', '3'), // le falta 1: empata con pastillas
      low('filtro', '4', '4'), // en el mínimo: le falta 0
    ]);

    const { total, productos } = await service.lowStock(3);

    expect(prisma.producto.findMany).toHaveBeenCalledWith({
      where: { tipo: undefined, activo: true, stock: { lte: MIN_STOCK } },
      select: {
        productoId: true,
        codigo: true,
        nombre: true,
        stock: true,
        stockMinimo: true,
        unidad: true,
      },
    });
    // El total cuenta todos aunque solo salgan tres.
    expect(total).toBe(4);
    expect(productos.map((p) => p.nombre)).toEqual([
      'aceite',
      'bujias',
      'pastillas',
    ]);
  });

  it('traduce el código repetido de la base (P2002) a un 409 propio', async () => {
    prisma.producto.create.mockRejectedValue(p2002());
    await expect(service.create(valid)).rejects.toThrow(DUPLICATE);
  });

  it('también al cambiarle el código a uno que ya existe', async () => {
    prisma.producto.findUnique.mockResolvedValue({ productoId: 'p1' });
    prisma.producto.update.mockRejectedValue(p2002());
    await expect(service.update('p1', { codigo: 'FA-002' })).rejects.toThrow(
      DUPLICATE,
    );
  });

  it('responde 404 al editar un producto que no existe', async () => {
    prisma.producto.findUnique.mockResolvedValue(null);
    await expect(service.update('p1', { activo: false })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.producto.update).not.toHaveBeenCalled();
  });

  it('no borra un producto con movimientos ni ítems de órdenes, y dice por qué', async () => {
    prisma.producto.findUnique.mockResolvedValue({
      _count: { movimientos: 3, detallesOrden: 1 },
    });
    await expect(service.remove('p1')).rejects.toThrow(
      new ConflictException(
        'No se puede eliminar: el producto tiene historial (3 movimientos de stock y 1 ítem de órdenes de trabajo). Puedes desactivarlo para que deje de ofrecerse',
      ),
    );
    expect(prisma.producto.delete).not.toHaveBeenCalled();
  });

  it('nombra solo el historial que tiene', async () => {
    prisma.producto.findUnique.mockResolvedValue({
      _count: { movimientos: 1, detallesOrden: 0 },
    });
    await expect(service.remove('p1')).rejects.toThrow(
      'No se puede eliminar: el producto tiene historial (1 movimiento de stock). Puedes desactivarlo para que deje de ofrecerse',
    );
  });

  it('borra de verdad un producto sin historial', async () => {
    prisma.producto.findUnique.mockResolvedValue({
      _count: { movimientos: 0, detallesOrden: 0 },
    });
    await service.remove('p1');
    expect(prisma.producto.delete).toHaveBeenCalledWith({
      where: { productoId: 'p1' },
    });
  });

  it('responde 404 al borrar un producto que no existe', async () => {
    prisma.producto.findUnique.mockResolvedValue(null);
    await expect(service.remove('p1')).rejects.toThrow(NotFoundException);
  });
});

describe('ProductsService.applyStockChange', () => {
  // La transacción del llamador: el método solo usa sus consultas de producto.
  const tx = {
    producto: { updateMany: vi.fn(), findUnique: vi.fn() },
  };
  const service = new ProductsService({} as PrismaService);
  const apply = (change: StockChange) =>
    service.applyStockChange(tx as unknown as Prisma.TransactionClient, change);
  const product = (overrides: Record<string, unknown> = {}) => ({
    productoId: 'p1',
    codigo: 'FA-001',
    stock: new Prisma.Decimal('3'),
    costo: new Prisma.Decimal('12.5'),
    activo: true,
    ...overrides,
  });

  afterEach(() => vi.clearAllMocks());

  it('una compra suma al stock de forma atómica y actualiza el costo', async () => {
    tx.producto.updateMany.mockResolvedValue({ count: 1 });
    tx.producto.findUnique.mockResolvedValue(product());

    await apply({
      tipo: 'COMPRA',
      productoId: 'p1',
      cantidad: '12',
      costoUnitario: '13.80',
    });

    expect(tx.producto.updateMany).toHaveBeenCalledWith({
      where: { productoId: 'p1', activo: true },
      data: {
        stock: { increment: new Prisma.Decimal('12') },
        costo: '13.80',
      },
    });
  });

  it('un ajuste que resta solo se aplica si alcanza el stock, en la misma sentencia', async () => {
    tx.producto.updateMany.mockResolvedValue({ count: 1 });
    tx.producto.findUnique.mockResolvedValue(product());

    await apply({ tipo: 'AJUSTE', productoId: 'p1', cantidad: '-2.5' });

    expect(tx.producto.updateMany).toHaveBeenCalledWith({
      where: {
        productoId: 'p1',
        activo: true,
        stock: { gte: new Prisma.Decimal('2.5') },
      },
      // Sin costo: solo la compra lo cambia.
      data: { stock: { increment: new Prisma.Decimal('-2.5') } },
    });
  });

  it('devuelve el producto actualizado, leído en la misma transacción', async () => {
    const updated = product({ stock: new Prisma.Decimal('15') });
    tx.producto.updateMany.mockResolvedValue({ count: 1 });
    tx.producto.findUnique.mockResolvedValue(updated);

    await expect(
      apply({ tipo: 'AJUSTE', productoId: 'p1', cantidad: '12' }),
    ).resolves.toBe(updated);
    expect(tx.producto.findUnique).toHaveBeenCalledWith({
      where: { productoId: 'p1' },
    });
  });

  it('si no alcanza, responde 409 con lo que queda y no deja el stock negativo', async () => {
    tx.producto.updateMany.mockResolvedValue({ count: 0 });
    tx.producto.findUnique.mockResolvedValue(product());

    await expect(
      apply({ tipo: 'AJUSTE', productoId: 'p1', cantidad: '-5' }),
    ).rejects.toThrow(
      new ConflictException('Stock insuficiente: quedan 3.00 de FA-001'),
    );
  });

  it('responde 404 si el producto no existe', async () => {
    tx.producto.updateMany.mockResolvedValue({ count: 0 });
    tx.producto.findUnique.mockResolvedValue(null);

    await expect(
      apply({
        tipo: 'COMPRA',
        productoId: 'p1',
        cantidad: '1',
        costoUnitario: '1',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('no registra compras ni ajustes de un producto inactivo', async () => {
    tx.producto.updateMany.mockResolvedValue({ count: 0 });
    tx.producto.findUnique.mockResolvedValue(product({ activo: false }));

    await expect(
      apply({ tipo: 'AJUSTE', productoId: 'p1', cantidad: '1' }),
    ).rejects.toThrow(
      new BadRequestException(
        'El producto está inactivo: actívalo antes de registrarle compras o ajustes',
      ),
    );
  });

  it('el consumo en una orden no exige el producto activo', async () => {
    tx.producto.updateMany.mockResolvedValue({ count: 1 });
    tx.producto.findUnique.mockResolvedValue(product({ activo: false }));

    await apply({ tipo: 'ORDEN_TRABAJO', productoId: 'p1', cantidad: '-1' });

    expect(tx.producto.updateMany).toHaveBeenCalledWith({
      where: { productoId: 'p1', stock: { gte: new Prisma.Decimal('1') } },
      data: { stock: { increment: new Prisma.Decimal('-1') } },
    });
  });

  it('un consumo sin stock suficiente también es 409, aunque el producto esté inactivo', async () => {
    tx.producto.updateMany.mockResolvedValue({ count: 0 });
    tx.producto.findUnique.mockResolvedValue(
      product({ activo: false, stock: new Prisma.Decimal('0') }),
    );

    await expect(
      apply({ tipo: 'ORDEN_TRABAJO', productoId: 'p1', cantidad: '-1' }),
    ).rejects.toThrow('Stock insuficiente: quedan 0.00 de FA-001');
  });
});
