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
    expect(dto).toMatchObject({ ordenarPor: 'creadoEn', sentido: 'desc' });
  });

  it('acepta el tipo, el producto y un rango de días', async () => {
    expect(
      (
        await errorsOf({
          tipo: 'ORDEN_TRABAJO',
          productoId: '6f1c2a5e-8d3b-4c7a-9e1f-2b3c4d5e6f70',
          desde: '2026-10-01',
          hasta: '2026-10-31',
        })
      ).messages,
    ).toEqual([]);
  });

  it('las fechas son días AAAA-MM-DD que existen', async () => {
    const message = (label: string) =>
      `${label} es un día con el formato AAAA-MM-DD, por ejemplo 2026-10-04`;
    expect(
      (await errorsOf({ desde: '01/10/2026', hasta: '2026-02-30' })).messages,
    ).toEqual([message('La fecha desde'), message('La fecha hasta')]);
    expect((await errorsOf({ desde: '2026-10-01T00:00' })).messages).toEqual([
      message('La fecha desde'),
    ]);
    expect((await errorsOf({ desde: '2028-02-29' })).messages).toEqual([]);
  });

  it('rechaza un tipo, un producto o un orden que no existen', async () => {
    expect(
      (
        await errorsOf({
          tipo: 'VENTA',
          productoId: '123',
          ordenarPor: 'costoUnitario',
        })
      ).messages,
    ).toEqual([
      'El tipo es COMPRA, ORDEN_TRABAJO o AJUSTE',
      'El producto no es válido',
      'Se ordena por creadoEn o cantidad',
    ]);
  });
});
