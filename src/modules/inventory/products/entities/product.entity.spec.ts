import { Prisma } from '../../../../generated/prisma/client.js';
import { Product } from './product.entity.js';

function model(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    productId: 'p1',
    code: 'ACE-2050-GL',
    name: 'Aceite de motor 20W-50',
    kind: 'SUPPLY' as const,
    unit: 'GALLON' as const,
    brand: 'Castrol',
    stock: new Prisma.Decimal('4.5'),
    minStock: new Prisma.Decimal('3'),
    cost: new Prisma.Decimal('68'),
    price: new Prisma.Decimal('95.5'),
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Product', () => {
  it('para ADMIN saca el costo y el margen, con dos decimales', () => {
    const product = new Product(model(), { includeCosts: true });
    expect(JSON.parse(JSON.stringify(product))).toMatchObject({
      stock: '4.50',
      minStock: '3.00',
      cost: '68.00',
      price: '95.50',
      margin: '27.50',
      isLowStock: false,
    });
  });

  it('para el mecánico no saca ni el costo ni el margen', () => {
    const json = JSON.parse(
      JSON.stringify(new Product(model(), { includeCosts: false })),
    );
    expect(json).not.toHaveProperty('cost');
    expect(json).not.toHaveProperty('margin');
    expect(json).toMatchObject({ price: '95.50', stock: '4.50' });
  });

  it('el margen sale negativo si se vende por debajo del costo', () => {
    const product = new Product(
      model({
        cost: new Prisma.Decimal('30'),
        price: new Prisma.Decimal('25'),
      }),
      { includeCosts: true },
    );
    expect(product.margin).toBe('-5.00');
  });

  it.each([
    ['2', '3', true],
    ['3', '3', true],
    ['3.01', '3', false],
    ['0', '0', true],
  ])('con stock %s y mínimo %s, stock bajo es %s', (stock, minStock, low) => {
    const product = new Product(
      model({
        stock: new Prisma.Decimal(stock),
        minStock: new Prisma.Decimal(minStock),
      }),
      { includeCosts: false },
    );
    expect(product.isLowStock).toBe(low);
  });
});
