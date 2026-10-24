import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AssignToolDto } from './assign-tool.dto.js';

async function messagesOf(body: Record<string, unknown>) {
  const dto = plainToInstance(AssignToolDto, body);
  const errors = await validate(dto, { stopAtFirstError: true });
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('AssignToolDto', () => {
  it('acepta un usuario o null para devolverla al almacén', async () => {
    expect(
      await messagesOf({
        assignedToId: '7b1e4c8a-2f3d-4e5f-8a9b-0c1d2e3f4a5b',
      }),
    ).toEqual([]);
    expect(await messagesOf({ assignedToId: null })).toEqual([]);
  });

  it('exige la clave: un cuerpo vacío no la devuelve por omisión', async () => {
    const message = 'Selecciona a quién se le asigna, o null para devolverla';
    expect(await messagesOf({})).toEqual([message]);
    expect(await messagesOf({ assignedToId: 'juan' })).toEqual([message]);
  });
});
