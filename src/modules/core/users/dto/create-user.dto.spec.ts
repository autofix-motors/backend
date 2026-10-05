import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangeUserPasswordDto } from './change-user-password.dto.js';
import { CreateUserDto } from './create-user.dto.js';

const valid = {
  email: 'jquispe@autofix.local',
  name: 'Juan Quispe',
  role: 'MECHANIC',
  password: 'Mecanico123',
};

async function check(body: Record<string, unknown>) {
  const dto = plainToInstance(CreateUserDto, body);
  const errors = await validate(dto, { stopAtFirstError: true });
  return {
    dto,
    messages: errors.flatMap((error) => Object.values(error.constraints ?? {})),
  };
}

describe('CreateUserDto', () => {
  it('guarda el correo en minúsculas y sin espacios', async () => {
    const { dto, messages } = await check({
      ...valid,
      email: '  JQuispe@AutoFix.Local ',
    });
    expect(messages).toEqual([]);
    expect(dto.email).toBe('jquispe@autofix.local');
  });

  it('normaliza el teléfono y deja vacío como «sin teléfono»', async () => {
    expect((await check({ ...valid, phone: '987 654-321' })).dto.phone).toBe(
      '987654321',
    );
    const empty = await check({ ...valid, phone: '  ' });
    expect(empty.messages).toEqual([]);
    expect(empty.dto.phone).toBeNull();
  });

  it('exige una contraseña de 8 a 200 caracteres', async () => {
    expect((await check({ ...valid, password: 'corta' })).messages).toEqual([
      'La contraseña tiene al menos 8 caracteres',
    ]);
    expect(
      (await check({ ...valid, password: 'x'.repeat(201) })).messages,
    ).toEqual(['La contraseña es demasiado larga']);
  });

  it('solo acepta los roles que existen', async () => {
    expect((await check({ ...valid, role: 'OWNER' })).messages).toEqual([
      'El rol es ADMIN o MECHANIC',
    ]);
  });
});

describe('ChangeUserPasswordDto', () => {
  it('aplica la misma regla de contraseña que el alta', async () => {
    const dto = plainToInstance(ChangeUserPasswordDto, { password: '1234567' });
    const errors = await validate(dto, { stopAtFirstError: true });
    expect(errors.flatMap((e) => Object.values(e.constraints ?? {}))).toEqual([
      'La contraseña tiene al menos 8 caracteres',
    ]);
  });
});
