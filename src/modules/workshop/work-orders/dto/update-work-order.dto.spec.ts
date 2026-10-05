import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateWorkOrderDto } from './update-work-order.dto.js';

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

describe('UpdateWorkOrderDto', () => {
  it('acepta un cuerpo con solo algunos campos', async () => {
    expect(
      (await check(UpdateWorkOrderDto, { mileageIn: 90000 })).messages,
    ).toEqual([]);
  });

  it('rechaza null en el kilometraje y el motivo, en vez de dejarlo llegar a la base', async () => {
    expect(
      (await check(UpdateWorkOrderDto, { mileageIn: null, reason: null }))
        .messages,
    ).toEqual([
      'El kilometraje es un número entero de km',
      'Ingresa el motivo del ingreso',
    ]);
  });

  it('acepta null en la fecha prometida y el mecánico: así se quitan', async () => {
    expect(
      (
        await check(UpdateWorkOrderDto, {
          promisedDate: null,
          mechanicId: null,
        })
      ).messages,
    ).toEqual([]);
  });

  it('el vehículo no se cambia', async () => {
    expect(
      (await check(UpdateWorkOrderDto, { vehicleId: VEHICLE_ID })).messages,
    ).toEqual(['no permitido: vehicleId']);
  });
});
