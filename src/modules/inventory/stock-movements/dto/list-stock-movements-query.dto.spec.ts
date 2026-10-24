import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListStockMovementsQueryDto } from './list-stock-movements-query.dto.js';

async function errorsOf(query: Record<string, unknown>) {
  const dto = plainToInstance(ListStockMovementsQueryDto, query);
  const errors = await validate(dto, { stopAtFirstError: true });
  return {
    dto,
    messages: errors.flatMap((error) => Object.values(error.constraints ?? {})),
  };
}

describe('ListStockMovementsQueryDto', () => {
  it('por defecto ordena lo más reciente primero', async () => {
    const { dto, messages } = await errorsOf({});
    expect(messages).toEqual([]);
    expect(dto).toMatchObject({ sortBy: 'createdAt', sortOrder: 'desc' });
  });

  it('acepta el tipo, el producto y un rango de días', async () => {
    expect(
      (
        await errorsOf({
          type: 'WORK_ORDER',
          productId: '6f1c2a5e-8d3b-4c7a-9e1f-2b3c4d5e6f70',
          from: '2026-10-01',
          to: '2026-10-31',
        })
      ).messages,
    ).toEqual([]);
  });

  it('las fechas son días AAAA-MM-DD que existen', async () => {
    const message = (label: string) =>
      `${label} es un día con el formato AAAA-MM-DD, por ejemplo 2026-10-04`;
    expect(
      (await errorsOf({ from: '01/10/2026', to: '2026-02-30' })).messages,
    ).toEqual([message('La fecha desde'), message('La fecha hasta')]);
    expect((await errorsOf({ from: '2026-10-01T00:00' })).messages).toEqual([
      message('La fecha desde'),
    ]);
    expect((await errorsOf({ from: '2028-02-29' })).messages).toEqual([]);
  });

  it('rechaza un tipo, un producto o un orden que no existen', async () => {
    expect(
      (
        await errorsOf({
          type: 'SALE',
          productId: '123',
          sortBy: 'unitCost',
        })
      ).messages,
    ).toEqual([
      'El tipo es PURCHASE, WORK_ORDER o ADJUSTMENT',
      'El producto no es válido',
      'Se ordena por createdAt o quantity',
    ]);
  });
});
