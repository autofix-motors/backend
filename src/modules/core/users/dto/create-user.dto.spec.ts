import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from './create-user.dto.js';

const valid = {
  correo: 'jquispe@autofix.local',
  numeroDocumento: '45678912',
  nombre: 'Juan Quispe',
  rol: 'MECANICO',
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
      correo: '  JQuispe@AutoFix.Local ',
    });
    expect(messages).toEqual([]);
    expect(dto.correo).toBe('jquispe@autofix.local');
  });

  it('normaliza el DNI y exige sus 8 dígitos', async () => {
    const { dto, messages } = await check({
      ...valid,
      numeroDocumento: ' 45.678.912 ',
    });
    expect(messages).toEqual([]);
    expect(dto.numeroDocumento).toBe('45678912');

    expect(
      (await check({ ...valid, numeroDocumento: '1234' })).messages,
    ).toEqual(['El DNI tiene 8 dígitos']);
    expect(
      (await check({ ...valid, numeroDocumento: undefined })).messages,
    ).toEqual(['Ingresa el DNI']);
  });

  it('normaliza el teléfono y deja vacío como «sin teléfono»', async () => {
    expect(
      (await check({ ...valid, telefono: '987 654-321' })).dto.telefono,
    ).toBe('987654321');
    const empty = await check({ ...valid, telefono: '  ' });
    expect(empty.messages).toEqual([]);
    expect(empty.dto.telefono).toBeNull();
  });

  it('no recibe contraseña: la genera el sistema', async () => {
    expect(
      (await check({ ...valid, contrasena: 'Mecanico123' })).messages,
    ).toEqual(['property contrasena should not exist']);
  });

  it('solo acepta los roles que existen', async () => {
    expect((await check({ ...valid, rol: 'OWNER' })).messages).toEqual([
      'El rol es ADMINISTRADOR o MECANICO',
    ]);
  });
});
