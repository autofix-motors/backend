import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateToolDto } from './update-tool.dto.js';

async function messagesOf(body: Record<string, unknown>) {
  const dto = plainToInstance(UpdateToolDto, body);
  const errors = await validate(dto, { stopAtFirstError: true });
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('UpdateToolDto', () => {
  it('acepta un cuerpo con solo algunos campos', async () => {
    expect(await messagesOf({ status: 'IN_REPAIR' })).toEqual([]);
    expect(await messagesOf({ name: 'Gata de 3 t', brand: 'Truper' })).toEqual(
      [],
    );
  });

  it('rechaza null en un campo obligatorio, en vez de dejarlo llegar a la base', async () => {
    expect(await messagesOf({ name: null })).toEqual([
      'Ingresa el nombre de la herramienta',
    ]);
    expect(await messagesOf({ code: null })).toEqual(['Ingresa el código']);
    expect(await messagesOf({ status: null })).toEqual([
      'El estado es AVAILABLE (operativa), IN_REPAIR (en reparación) o RETIRED (de baja)',
    ]);
  });

  it('acepta null en la marca, las notas y la asignación: así se borran', async () => {
    expect(
      await messagesOf({ brand: null, notes: null, assignedToId: null }),
    ).toEqual([]);
  });
});
