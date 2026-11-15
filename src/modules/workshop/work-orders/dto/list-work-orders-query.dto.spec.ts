import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListWorkOrdersQueryDto } from './list-work-orders-query.dto.js';

async function check(query: Record<string, unknown>) {
  const dto = plainToInstance(ListWorkOrdersQueryDto, query);
  const errors = await validate(dto, { stopAtFirstError: true });
  return {
    dto,
    messages: errors.flatMap((error) => Object.values(error.constraints ?? {})),
  };
}

describe('ListWorkOrdersQueryDto', () => {
  it('por defecto, lo último que entró primero', async () => {
    const { dto, messages } = await check({});
    expect(messages).toEqual([]);
    expect(dto).toMatchObject({ ordenarPor: 'recibidaEn', sentido: 'desc' });
  });

  it('el estado llega separado por comas y se vuelve una lista', async () => {
    const { dto, messages } = await check({
      estado: 'RECIBIDO, EN_DIAGNOSTICO,',
    });
    expect(messages).toEqual([]);
    expect(dto.estado).toEqual(['RECIBIDO', 'EN_DIAGNOSTICO']);
    expect((await check({ estado: '' })).dto.estado).toBeUndefined();
    expect((await check({ estado: 'LISTO' })).dto.estado).toEqual(['LISTO']);
  });

  it('rechaza un estado que no existe', async () => {
    expect((await check({ estado: 'LISTO,FINISHED' })).messages).toEqual([
      'El estado no es válido',
    ]);
  });

  it('vencidas, rango de días y los filtros por id', async () => {
    const { dto, messages } = await check({
      vencidas: 'true',
      desde: '2026-10-01',
      hasta: '2026-10-31',
      mecanicoId: '6f1c2a5e-8d3b-4c7a-9e1f-2b3c4d5e6f70',
      vehiculoId: '6f1c2a5e-8d3b-4c7a-9e1f-2b3c4d5e6f70',
      clienteId: '6f1c2a5e-8d3b-4c7a-9e1f-2b3c4d5e6f70',
      ordenarPor: 'fechaPrometida',
    });
    expect(messages).toEqual([]);
    expect(dto.vencidas).toBe(true);
    expect((await check({ vencidas: 'false' })).dto.vencidas).toBe(false);
  });

  it('rechaza lo que no se entiende', async () => {
    expect(
      (
        await check({
          vencidas: 'si',
          desde: '2026-02-30',
          vehiculoId: '123',
          ordenarPor: 'estado',
        })
      ).messages,
    ).toEqual([
      'El vehículo no es válido',
      'El filtro de vencidas es true o false',
      'La fecha desde es un día con el formato AAAA-MM-DD, por ejemplo 2026-10-04',
      'Se ordena por recibidaEn, fechaPrometida o numero',
    ]);
  });
});
