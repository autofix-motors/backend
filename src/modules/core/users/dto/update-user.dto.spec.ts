import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserDto } from './update-user.dto.js';

async function messagesOf(body: Record<string, unknown>) {
  const dto = plainToInstance(UpdateUserDto, body);
  const errors = await validate(dto, { stopAtFirstError: true });
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('UpdateUserDto', () => {
  it('acepta un cuerpo con solo algunos campos', async () => {
    expect(await messagesOf({ isActive: false })).toEqual([]);
  });

  it('rechaza null en un campo obligatorio, en vez de dejarlo llegar a la base', async () => {
    expect(await messagesOf({ name: null })).toEqual(['Ingresa el nombre']);
    expect(await messagesOf({ isActive: null })).toEqual([
      'El estado tiene que ser verdadero o falso',
    ]);
  });

  it('acepta null en el teléfono: así se borra el dato', async () => {
    expect(await messagesOf({ phone: null })).toEqual([]);
  });

  it('no acepta la contraseña: tiene su propio endpoint', async () => {
    // Con la lista blanca del pipe global, una propiedad no declarada es 400.
    const dto = plainToInstance(UpdateUserDto, { password: 'OtraClave123' });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.map((error) => error.property)).toEqual(['password']);
  });
});
