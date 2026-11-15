import { Prisma } from '../../../../generated/prisma/client.js';
import { StockMovement } from './stock-movement.entity.js';

function model(overrides: Record<string, unknown> = {}) {
  return {
    movimientoStockId: 'm1',
    productoId: 'p1',
    tipo: 'AJUSTE' as const,
    cantidad: new Prisma.Decimal('-1.5'),
    costoUnitario: new Prisma.Decimal('68'),
    detalleOrdenId: null,
    nota: 'Merma: envase roto',
    creadoPorId: 'u1',
    creadoEn: new Date('2026-10-04T20:00:00.000Z'),
    producto: {
      productoId: 'p1',
      codigo: 'ACE-2050-GL',
      nombre: 'Aceite de motor 20W-50',
      unidad: 'GALON' as const,
      // Lo que no es del resumen no sale aunque venga en el registro.
      costo: new Prisma.Decimal('68'),
    },
    creadoPor: { usuarioId: 'u1', nombre: 'Administrador', correo: 'a@b.pe' },
    ...overrides,
  };
}

const json = (movement: StockMovement) =>
  JSON.parse(JSON.stringify(movement)) as Record<string, unknown>;

describe('StockMovement', () => {
  it('saca la cantidad con su signo y dos decimales, y el costo para ADMINISTRADOR', () => {
    expect(
      json(new StockMovement(model(), { incluirCostos: true })),
    ).toStrictEqual({
      movimientoStockId: 'm1',
      tipo: 'AJUSTE',
      cantidad: '-1.50',
      costoUnitario: '68.00',
      nota: 'Merma: envase roto',
      detalleOrdenId: null,
      producto: {
        productoId: 'p1',
        codigo: 'ACE-2050-GL',
        nombre: 'Aceite de motor 20W-50',
        unidad: 'GALON',
      },
      creadoPor: { usuarioId: 'u1', nombre: 'Administrador' },
      creadoEn: '2026-10-04T20:00:00.000Z',
    });
  });

  it('para el mecánico no saca el costo', () => {
    expect(
      json(new StockMovement(model(), { incluirCostos: false })),
    ).not.toHaveProperty('costoUnitario');
  });

  it('un movimiento sin costo lo saca como null para ADMINISTRADOR', () => {
    expect(
      json(
        new StockMovement(model({ costoUnitario: null }), {
          incluirCostos: true,
        }),
      ).costoUnitario,
    ).toBeNull();
  });
});
