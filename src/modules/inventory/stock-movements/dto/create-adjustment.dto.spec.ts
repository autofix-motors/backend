import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAdjustmentDto } from './create-adjustment.dto.js';

// Valida como lo hace el pipe global: transforma y se detiene en el primer
// error de cada campo.
async function errorsOf(body: Record<string, unknown>) {
  const dto = plainToInstance(CreateAdjustmentDto, body);
  const errors = await validate(dto, { stopAtFirstError: true });
  return {
    dto,
    messages: errors.flatMap((error) => Object.values(error.constraints ?? {})),
  };
}

const valid = {
  productId: '6f1c2a5e-8d3b-4c7a-9e1f-2b3c4d5e6f70',
  quantity: '-2',
  note: 'Merma: envase roto',
};

describe('CreateAdjustmentDto', () => {
  it('acepta una cantidad con signo, que suma o resta', async () => {
    expect((await errorsOf(valid)).messages).toEqual([]);
    const { dto, messages } = await errorsOf({ ...valid, quantity: 3.5 });
    expect(messages).toEqual([]);
    expect(dto.quantity).toBe('3.5');
  });

  it('la cantidad no puede ser 0', async () => {
    for (const quantity of ['0', '-0', '0.00']) {
      expect((await errorsOf({ ...valid, quantity })).messages).toEqual([
        'La cantidad no puede ser 0: positiva suma al stock y negativa resta',
      ]);
    }
  });

  it('valida la forma y el tamaño de la cantidad, también con signo', async () => {
    expect((await errorsOf({ ...valid, quantity: '-1.255' })).messages).toEqual(
      ['La cantidad tiene como máximo 2 decimales'],
    );
    expect(
      (await errorsOf({ ...valid, quantity: '-100000000' })).messages,
    ).toEqual(['La cantidad va de -99999999.99 a 99999999.99']);
    expect((await errorsOf({ ...valid, quantity: '--2' })).messages).toEqual([
      'La cantidad es una cantidad con signo y hasta 2 decimales, por ejemplo -2.50',
    ]);
  });

  it('el motivo es obligatorio y se recorta', async () => {
    for (const note of [undefined, null, '   ']) {
      expect((await errorsOf({ ...valid, note })).messages).toEqual([
        'Ingresa el motivo del ajuste',
      ]);
    }
    const { dto } = await errorsOf({ ...valid, note: '  Inventario físico ' });
    expect(dto.note).toBe('Inventario físico');
  });

  it('limita el motivo a 500 caracteres', async () => {
    expect(
      (await errorsOf({ ...valid, note: 'x'.repeat(501) })).messages,
    ).toEqual(['El motivo tiene como máximo 500 caracteres']);
  });
});
