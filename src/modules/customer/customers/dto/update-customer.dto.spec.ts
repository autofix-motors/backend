import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCustomerDto } from './update-customer.dto.js';

async function messagesOf(body: Record<string, unknown>) {
  const dto = plainToInstance(UpdateCustomerDto, body);
  const errors = await validate(dto, { stopAtFirstError: true });
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('UpdateCustomerDto', () => {
  it('acepta un cuerpo con solo algunos campos', async () => {
    expect(await messagesOf({ phone: '987654321' })).toEqual([]);
  });

  it('rechaza null en un campo obligatorio, en vez de dejarlo llegar a la base', async () => {
    expect(await messagesOf({ name: null })).toEqual([
      'Ingresa el nombre o la razón social',
    ]);
  });

  it('acepta null en un opcional: así se borra el dato', async () => {
    expect(await messagesOf({ email: null, notes: null })).toEqual([]);
  });
});
