import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateWorkOrderDto } from './create-work-order.dto.js';

// Igual que el pipe global: lista blanca estricta y un mensaje por campo.
async function check<T extends object>(
  type: ClassConstructor<T>,
  body: Record<string, unknown>,
) {
  const dto = plainToInstance(type, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
    stopAtFirstError: true,
  });
  return {
    dto,
    messages: errors.flatMap((error) =>
      Object.entries(error.constraints ?? {}).map(([rule, message]) =>
        rule === 'whitelistValidation'
          ? `no permitido: ${error.property}`
          : message,
      ),
    ),
  };
}

const VEHICLE_ID = '6f1c2a5e-8d3b-4c7a-9e1f-2b3c4d5e6f70';

describe('CreateWorkOrderDto', () => {
  const valid = {
    vehicleId: VEHICLE_ID,
    mileageIn: 84500,
    reason: '  Ruido al frenar  ',
  };

  it('acepta el ingreso mínimo y recorta el motivo', async () => {
    const { dto, messages } = await check(CreateWorkOrderDto, valid);
    expect(messages).toEqual([]);
    expect(dto.reason).toBe('Ruido al frenar');
  });

  it('acepta la fecha prometida y el mecánico, o null en los dos', async () => {
    expect(
      (
        await check(CreateWorkOrderDto, {
          ...valid,
          promisedDate: '2026-10-08',
          mechanicId: VEHICLE_ID,
        })
      ).messages,
    ).toEqual([]);
    expect(
      (
        await check(CreateWorkOrderDto, {
          ...valid,
          promisedDate: null,
          mechanicId: null,
        })
      ).messages,
    ).toEqual([]);
  });

  it('pide el vehículo, el kilometraje y el motivo', async () => {
    expect(
      (await check(CreateWorkOrderDto, { reason: '   ' })).messages,
    ).toEqual([
      'Selecciona el vehículo',
      'El kilometraje es un número entero de km',
      'Ingresa el motivo del ingreso',
    ]);
  });

  it('el kilometraje es un entero de 0 a 9 999 999', async () => {
    const mileage = async (mileageIn: unknown) =>
      (await check(CreateWorkOrderDto, { ...valid, mileageIn })).messages;
    expect(await mileage(0)).toEqual([]);
    expect(await mileage(9_999_999)).toEqual([]);
    expect(await mileage(-1)).toEqual(['El kilometraje no puede ser negativo']);
    expect(await mileage(10_000_000)).toEqual([
      'El kilometraje es como máximo 9 999 999',
    ]);
    expect(await mileage(12.5)).toEqual([
      'El kilometraje es un número entero de km',
    ]);
    expect(await mileage('84500')).toEqual([
      'El kilometraje es un número entero de km',
    ]);
  });

  it('topes del motivo, la fecha y el mecánico', async () => {
    expect(
      (
        await check(CreateWorkOrderDto, {
          ...valid,
          reason: 'x'.repeat(2001),
          promisedDate: '2026-02-30',
          mechanicId: '123',
        })
      ).messages,
    ).toEqual([
      'El motivo tiene como máximo 2000 caracteres',
      'La fecha prometida es un día con el formato AAAA-MM-DD, por ejemplo 2026-10-04',
      'El mecánico no es válido',
    ]);
  });
});
