import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateToolDto } from './create-tool.dto.js';

// Valida como lo hace el pipe global: transforma y se detiene en el primer
// error de cada campo.
async function errorsOf(body: Record<string, unknown>) {
  const dto = plainToInstance(CreateToolDto, body);
  const errors = await validate(dto, { stopAtFirstError: true });
  return {
    dto,
    messages: errors.flatMap((error) => Object.values(error.constraints ?? {})),
  };
}

const valid = { code: 'HER-01', name: 'Gata hidráulica 3 t' };

describe('CreateToolDto', () => {
  it('deja el código en mayúsculas y sin espacios en los extremos', async () => {
    const { dto, messages } = await errorsOf({
      ...valid,
      code: '  her-torq 01 ',
    });
    expect(messages).toEqual([]);
    expect(dto.code).toBe('HER-TORQ 01');
  });

  it('rechaza un código vacío o de más de 30 caracteres', async () => {
    expect((await errorsOf({ ...valid, code: '   ' })).messages).toEqual([
      'Ingresa el código',
    ]);
    expect(
      (await errorsOf({ ...valid, code: 'X'.repeat(31) })).messages,
    ).toEqual(['El código tiene como máximo 30 caracteres']);
  });

  it('exige el nombre, de hasta 150 caracteres', async () => {
    expect((await errorsOf({ code: 'HER-01' })).messages).toEqual([
      'Ingresa el nombre de la herramienta',
    ]);
    expect(
      (await errorsOf({ ...valid, name: 'x'.repeat(151) })).messages,
    ).toEqual(['El nombre tiene como máximo 150 caracteres']);
  });

  it('la marca y las notas vacías quedan en null', async () => {
    const { dto, messages } = await errorsOf({
      ...valid,
      brand: '  ',
      notes: '',
    });
    expect(messages).toEqual([]);
    expect(dto).toMatchObject({ brand: null, notes: null });
  });

  it('rechaza una marca de más de 60 caracteres', async () => {
    expect(
      (await errorsOf({ ...valid, brand: 'x'.repeat(61) })).messages,
    ).toEqual(['La marca tiene como máximo 60 caracteres']);
  });

  it('acepta asignarla o dejarla en el almacén con null', async () => {
    expect(
      (
        await errorsOf({
          ...valid,
          assignedToId: '7b1e4c8a-2f3d-4e5f-8a9b-0c1d2e3f4a5b',
        })
      ).messages,
    ).toEqual([]);
    expect((await errorsOf({ ...valid, assignedToId: null })).messages).toEqual(
      [],
    );
  });

  it('rechaza un estado o un usuario que no son válidos', async () => {
    expect(
      (await errorsOf({ ...valid, status: 'LOST', assignedToId: 'juan' }))
        .messages,
    ).toEqual([
      'El estado es AVAILABLE (operativa), IN_REPAIR (en reparación) o RETIRED (de baja)',
      'Selecciona a quién se le asigna',
    ]);
  });
});
