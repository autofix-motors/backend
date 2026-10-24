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
    expect(dto).toMatchObject({ sortBy: 'receivedAt', sortOrder: 'desc' });
  });

  it('el estado llega separado por comas y se vuelve una lista', async () => {
    const { dto, messages } = await check({
      status: 'RECEIVED, DIAGNOSIS,',
    });
    expect(messages).toEqual([]);
    expect(dto.status).toEqual(['RECEIVED', 'DIAGNOSIS']);
    expect((await check({ status: '' })).dto.status).toBeUndefined();
    expect((await check({ status: 'READY' })).dto.status).toEqual(['READY']);
  });

  it('rechaza un estado que no existe', async () => {
    expect((await check({ status: 'READY,FINISHED' })).messages).toEqual([
      'El estado no es válido',
    ]);
  });

  it('vencidas, rango de días y los filtros por id', async () => {
    const { dto, messages } = await check({
      overdue: 'true',
      from: '2026-10-01',
      to: '2026-10-31',
      mechanicId: '6f1c2a5e-8d3b-4c7a-9e1f-2b3c4d5e6f70',
      vehicleId: '6f1c2a5e-8d3b-4c7a-9e1f-2b3c4d5e6f70',
      customerId: '6f1c2a5e-8d3b-4c7a-9e1f-2b3c4d5e6f70',
      sortBy: 'promisedDate',
    });
    expect(messages).toEqual([]);
    expect(dto.overdue).toBe(true);
    expect((await check({ overdue: 'false' })).dto.overdue).toBe(false);
  });

  it('rechaza lo que no se entiende', async () => {
    expect(
      (
        await check({
          overdue: 'si',
          from: '2026-02-30',
          vehicleId: '123',
          sortBy: 'status',
        })
      ).messages,
    ).toEqual([
      'El vehículo no es válido',
      'El filtro de vencidas es true o false',
      'La fecha desde es un día con el formato AAAA-MM-DD, por ejemplo 2026-10-04',
      'Se ordena por receivedAt, promisedDate o number',
    ]);
  });
});
