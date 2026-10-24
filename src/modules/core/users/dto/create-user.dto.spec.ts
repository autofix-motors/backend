import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from './create-user.dto.js';

const valid = {
  email: 'jquispe@autofix.local',
  documentNumber: '45678912',
  name: 'Juan Quispe',
  role: 'MECHANIC',
};

async function check(body: Record<string, unknown>) {
  const dto = plainToInstance(CreateUserDto, body);
  const errors = await validate(dto, {
    stopAtFirstError: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
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

  it('normaliza el DNI y exige sus 8 dígitos', async () => {
    const { dto, messages } = await check({
      ...valid,
      documentNumber: ' 45.678.912 ',
    });
    expect(messages).toEqual([]);
    expect(dto.documentNumber).toBe('45678912');

    expect((await check({ ...valid, documentNumber: '1234' })).messages).toEqual(
      ['El DNI tiene 8 dígitos'],
    );
    expect(
      (await check({ ...valid, documentNumber: undefined })).messages,
    ).toEqual(['Ingresa el DNI']);
  });

  it('normaliza el teléfono y deja vacío como «sin teléfono»', async () => {
    expect((await check({ ...valid, phone: '987 654-321' })).dto.phone).toBe(
      '987654321',
    );
    const empty = await check({ ...valid, phone: '  ' });
    expect(empty.messages).toEqual([]);
    expect(empty.dto.phone).toBeNull();
  });

  it('no recibe contraseña: la genera el sistema', async () => {
    expect(
      (await check({ ...valid, password: 'Mecanico123' })).messages,
    ).toEqual(['property password should not exist']);
  });

  it('solo acepta los roles que existen', async () => {
    expect((await check({ ...valid, role: 'OWNER' })).messages).toEqual([
      'El rol es ADMIN o MECHANIC',
    ]);
  });
});
