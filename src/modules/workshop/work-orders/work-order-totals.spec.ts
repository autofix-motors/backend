import { Prisma } from '../../../generated/prisma/client.js';
import { itemSubtotal, workOrderAmounts } from './work-order-totals.js';

// Los montos se cuadran con Decimal: los casos son los que en coma flotante
// dan un céntimo de más o de menos.

const D = (value: string) => new Prisma.Decimal(value);
const service = (quantity: string, unitPrice: string) => ({
  type: 'SERVICE' as const,
  quantity: D(quantity),
  unitPrice: D(unitPrice),
  unitCost: null,
});
const part = (quantity: string, unitPrice: string, unitCost: string) => ({
  type: 'PRODUCT' as const,
  quantity: D(quantity),
  unitPrice: D(unitPrice),
  unitCost: D(unitCost),
});

describe('itemSubtotal', () => {
  it('cantidad por precio, redondeado a céntimos (medio céntimo hacia arriba)', () => {
    expect(itemSubtotal(service('1', '80')).toFixed(2)).toBe('80.00');
    // 1.25 × 38.90 = 48.625 → 48.63
    expect(itemSubtotal(part('1.25', '38.90', '0')).toFixed(2)).toBe('48.63');
    // 3 × 0.1 en coma flotante es 0.30000000000000004
    expect(itemSubtotal(part('3', '0.10', '0')).toString()).toBe('0.3');
  });
});

describe('workOrderAmounts', () => {
  it('sin ítems, todo en cero', () => {
    const amounts = workOrderAmounts([]);
    expect(Object.values(amounts).map((amount) => amount.toFixed(2))).toEqual([
      '0.00',
      '0.00',
      '0.00',
      '0.00',
      '0.00',
    ]);
  });

  it('separa mano de obra y repuestos, y el total es su suma exacta', () => {
    const amounts = workOrderAmounts([
      service('1', '0.10'),
      service('2', '0.20'),
      part('4.5', '38.90', '22.35'),
      part('1', '15.00', '9.80'),
    ]);
    expect(amounts.labor.toFixed(2)).toBe('0.50');
    // 4.5 × 38.90 = 175.05; más 15.00
    expect(amounts.parts.toFixed(2)).toBe('190.05');
    expect(amounts.total.toFixed(2)).toBe('190.55');
    // 4.5 × 22.35 = 100.575 → 100.58; más 9.80
    expect(amounts.partsCost.toFixed(2)).toBe('110.38');
    expect(amounts.partsMargin.toFixed(2)).toBe('79.67');
  });

  it('suma los subtotales ya redondeados, para cuadrar con cada línea', () => {
    // Cada línea es 0.005 → 0.01; sin redondear por línea, la suma daría 0.02.
    const amounts = workOrderAmounts([
      service('0.5', '0.01'),
      service('0.5', '0.01'),
      service('0.5', '0.01'),
    ]);
    expect(amounts.labor.toFixed(2)).toBe('0.03');
  });

  it('un servicio no suma costo, y un repuesto sin costo cuesta 0', () => {
    const amounts = workOrderAmounts([
      service('1', '100'),
      { ...part('2', '10', '0'), unitCost: null },
    ]);
    expect(amounts.partsCost.toFixed(2)).toBe('0.00');
    expect(amounts.partsMargin.toFixed(2)).toBe('20.00');
  });
});
