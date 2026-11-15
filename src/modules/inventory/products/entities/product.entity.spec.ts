import { Prisma } from '../../../../generated/prisma/client.js';
import { Product } from './product.entity.js';

function model(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    productoId: 'p1',
    codigo: 'ACE-2050-GL',
    nombre: 'Aceite de motor 20W-50',
    tipo: 'INSUMO' as const,
    unidad: 'GALON' as const,
    marca: 'Castrol',
    stock: new Prisma.Decimal('4.5'),
    stockMinimo: new Prisma.Decimal('3'),
    costo: new Prisma.Decimal('68'),
    precio: new Prisma.Decimal('95.5'),
    activo: true,
    creadoEn: now,
    actualizadoEn: now,
    ...overrides,
  };
}

describe('Product', () => {
  it('para ADMINISTRADOR saca el costo y el margen, con dos decimales', () => {
    const product = new Product(model(), { incluirCostos: true });
    expect(JSON.parse(JSON.stringify(product))).toMatchObject({
      stock: '4.50',
      stockMinimo: '3.00',
      costo: '68.00',
      precio: '95.50',
      margen: '27.50',
      stockBajo: false,
    });
  });

  it('para el mecánico no saca ni el costo ni el margen', () => {
    const json = JSON.parse(
      JSON.stringify(new Product(model(), { incluirCostos: false })),
    );
    expect(json).not.toHaveProperty('costo');
    expect(json).not.toHaveProperty('margen');
    expect(json).toMatchObject({ precio: '95.50', stock: '4.50' });
  });

  it('el margen sale negativo si se vende por debajo del costo', () => {
    const product = new Product(
      model({
        costo: new Prisma.Decimal('30'),
        precio: new Prisma.Decimal('25'),
      }),
      { incluirCostos: true },
    );
    expect(product.margen).toBe('-5.00');
  });

  it.each([
    ['2', '3', true],
    ['3', '3', true],
    ['3.01', '3', false],
    ['0', '0', true],
  ])(
    'con stock %s y mínimo %s, stock bajo es %s',
    (stock, stockMinimo, low) => {
      const product = new Product(
        model({
          stock: new Prisma.Decimal(stock),
          stockMinimo: new Prisma.Decimal(stockMinimo),
        }),
        { incluirCostos: false },
      );
      expect(product.stockBajo).toBe(low);
    },
  );
});
