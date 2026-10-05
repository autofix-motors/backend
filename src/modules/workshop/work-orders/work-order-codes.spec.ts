import {
  formatWorkOrderNumber,
  generateTrackingCode,
  parseWorkOrderNumber,
  TRACKING_CODE_ALPHABET,
} from './work-order-codes.js';

describe('generateTrackingCode', () => {
  it('es AFM- y 6 símbolos del alfabeto', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateTrackingCode();
      expect(code).toMatch(/^AFM-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    }
  });

  it('el alfabeto no tiene los símbolos que se confunden', () => {
    for (const ambiguous of ['0', 'O', '1', 'I', 'L']) {
      expect(TRACKING_CODE_ALPHABET).not.toContain(ambiguous);
    }
    expect(new Set(TRACKING_CODE_ALPHABET).size).toBe(31);
  });

  it('cada posición sale de la fuente aleatoria, con todo el alfabeto', () => {
    const pick = vi.fn((max: number) => max - 1);
    expect(generateTrackingCode(pick)).toBe('AFM-ZZZZZZ');
    expect(pick).toHaveBeenCalledTimes(6);
    expect(pick).toHaveBeenCalledWith(31);
    expect(generateTrackingCode(() => 0)).toBe('AFM-222222');
  });
});

describe('formatWorkOrderNumber', () => {
  it('rellena con ceros hasta seis dígitos', () => {
    expect(formatWorkOrderNumber(123)).toBe('OT-000123');
    expect(formatWorkOrderNumber(1234567)).toBe('OT-1234567');
  });
});

describe('parseWorkOrderNumber', () => {
  it('acepta el número solo o con el prefijo OT', () => {
    expect(parseWorkOrderNumber('123')).toBe(123);
    expect(parseWorkOrderNumber('OT-000123')).toBe(123);
    expect(parseWorkOrderNumber(' ot123 ')).toBe(123);
  });

  it('un texto que no es un número de orden no es un número', () => {
    expect(parseWorkOrderNumber('ABC123')).toBeUndefined();
    expect(parseWorkOrderNumber('12.5')).toBeUndefined();
    // No cabe en un Int: compararlo haría fallar la consulta.
    expect(parseWorkOrderNumber('1234567890')).toBeUndefined();
  });
});
