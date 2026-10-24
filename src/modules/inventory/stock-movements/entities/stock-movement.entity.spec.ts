import { Prisma } from '../../../../generated/prisma/client.js';
import { StockMovement } from './stock-movement.entity.js';

function model(overrides: Record<string, unknown> = {}) {
  return {
    stockMovementId: 'm1',
    productId: 'p1',
    type: 'ADJUSTMENT' as const,
    quantity: new Prisma.Decimal('-1.5'),
    unitCost: new Prisma.Decimal('68'),
    workOrderItemId: null,
    note: 'Merma: envase roto',
    createdById: 'u1',
    createdAt: new Date('2026-10-04T20:00:00.000Z'),
    product: {
      productId: 'p1',
      code: 'ACE-2050-GL',
      name: 'Aceite de motor 20W-50',
      unit: 'GALLON' as const,
      // Lo que no es del resumen no sale aunque venga en el registro.
      cost: new Prisma.Decimal('68'),
    },
    createdBy: { userId: 'u1', name: 'Administrador', email: 'a@b.pe' },
    ...overrides,
  };
}

const json = (movement: StockMovement) =>
  JSON.parse(JSON.stringify(movement)) as Record<string, unknown>;

describe('StockMovement', () => {
  it('saca la cantidad con su signo y dos decimales, y el costo para ADMIN', () => {
    expect(
      json(new StockMovement(model(), { includeCosts: true })),
    ).toStrictEqual({
      stockMovementId: 'm1',
      type: 'ADJUSTMENT',
      quantity: '-1.50',
      unitCost: '68.00',
      note: 'Merma: envase roto',
      workOrderItemId: null,
      product: {
        productId: 'p1',
        code: 'ACE-2050-GL',
        name: 'Aceite de motor 20W-50',
        unit: 'GALLON',
      },
      createdBy: { userId: 'u1', name: 'Administrador' },
      createdAt: '2026-10-04T20:00:00.000Z',
    });
  });

  it('para el mecánico no saca el costo', () => {
    expect(
      json(new StockMovement(model(), { includeCosts: false })),
    ).not.toHaveProperty('unitCost');
  });

  it('un movimiento sin costo lo saca como null para ADMIN', () => {
    expect(
      json(new StockMovement(model({ unitCost: null }), { includeCosts: true }))
        .unitCost,
    ).toBeNull();
  });
});
