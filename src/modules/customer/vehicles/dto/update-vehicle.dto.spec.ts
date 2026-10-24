import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateVehicleDto } from './update-vehicle.dto.js';

async function messagesOf(body: Record<string, unknown>) {
  const dto = plainToInstance(UpdateVehicleDto, body);
  const errors = await validate(dto, { stopAtFirstError: true });
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('UpdateVehicleDto', () => {
  it('rechaza null en un campo obligatorio', async () => {
    expect(await messagesOf({ brand: null })).toEqual(['Ingresa la marca']);
  });

  it('acepta null en un opcional: así se borra el dato', async () => {
    expect(await messagesOf({ color: null, vin: null, year: null })).toEqual(
      [],
    );
  });
});
