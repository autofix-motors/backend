import { fromDateColumn, toDateColumn } from './date-column.js';

describe('columnas de día', () => {
  it('el día va y vuelve igual, sin correrse por la zona horaria', () => {
    expect(toDateColumn('2026-10-08').toISOString()).toBe(
      '2026-10-08T00:00:00.000Z',
    );
    expect(fromDateColumn(toDateColumn('2026-12-31'))).toBe('2026-12-31');
  });
});
