import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePurchaseDto } from './create-purchase.dto.js';

// Valida como lo hace el pipe global: transforma y se detiene en el primer
// error de cada campo.
async function errorsOf(body: Record<string, unknown>) {
  const dto = plainToInstance(CreatePurchaseDto, body);
  const errors = await validate(dto, { stopAtFirstError: true });
  return {
    dto,
    messages: errors.flatMap((error) => Object.values(error.constraints ?? {})),
  };
}

const valid = {
  productId: '6f1c2a5e-8d3b-4c7a-9e1f-2b3c4d5e6f70',
  quantity: '12',
  unitCost: '18.50',
};

describe('CreatePurchaseDto', () => {
  it('acepta una compra con cantidad y costo como texto o número', async () => {
    const { dto, messages } = await errorsOf({
      ...valid,
      quantity: 4.5,
      unitCost: 68,
    });
    expect(messages).toEqual([]);
    expect(dto.quantity).toBe('4.5');
    expect(dto.unitCost).toBe('68');
  });

  it('la cantidad tiene que ser mayor que 0', async () => {
    expect((await errorsOf({ ...valid, quantity: '0' })).messages).toEqual([
      'La cantidad tiene que ser mayor que 0',
    ]);
    expect((await errorsOf({ ...valid, quantity: '0.00' })).messages).toEqual([
      'La cantidad tiene que ser mayor que 0',
    ]);
    expect((await errorsOf({ ...valid, quantity: '-3' })).messages).toEqual([
      'La cantidad tiene que ser mayor que 0',
    ]);
  });

  it('valida la cantidad y el costo como Decimal(10, 2)', async () => {
    expect(
      (await errorsOf({ ...valid, quantity: '1.255', unitCost: '12,50' }))
        .messages,
    ).toEqual([
      'La cantidad tiene como máximo 2 decimales',
      'El costo unitario es un monto en soles con hasta 2 decimales, por ejemplo 120.50',
    ]);
  });

  it('pide el producto, la cantidad y el costo', async () => {
    expect(
      (
        await errorsOf({
          productId: 'no-es-un-id',
          quantity: ' ',
          unitCost: '',
        })
      ).messages,
    ).toEqual([
      'Selecciona el producto',
      'Ingresa la cantidad',
      'Ingresa el costo unitario',
    ]);
  });

  it('la nota es opcional: en blanco queda como null', async () => {
    const { dto, messages } = await errorsOf({ ...valid, note: '   ' });
    expect(messages).toEqual([]);
    expect(dto.note).toBeNull();
    expect(
      (await errorsOf({ ...valid, note: 'x'.repeat(501) })).messages,
    ).toEqual(['La nota tiene como máximo 500 caracteres']);
  });
});
