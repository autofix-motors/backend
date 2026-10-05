import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './create-product.dto.js';

// Valida como lo hace el pipe global: transforma y se detiene en el primer
// error de cada campo.
async function errorsOf(body: Record<string, unknown>) {
  const dto = plainToInstance(CreateProductDto, body);
  const errors = await validate(dto, { stopAtFirstError: true });
  return {
    dto,
    messages: errors.flatMap((error) => Object.values(error.constraints ?? {})),
  };
}

const valid = {
  code: 'FA-001',
  name: 'Filtro de aceite',
  kind: 'PART',
  unit: 'UNIT',
  minStock: '4',
  cost: '12.50',
  price: '25',
};

describe('CreateProductDto', () => {
  it('deja el código en mayúsculas y sin espacios en los extremos', async () => {
    const { dto, messages } = await errorsOf({
      ...valid,
      code: '  fa-toy 01 ',
    });
    expect(messages).toEqual([]);
    expect(dto.code).toBe('FA-TOY 01');
  });

  it('rechaza un código vacío o demasiado largo', async () => {
    expect((await errorsOf({ ...valid, code: '   ' })).messages).toEqual([
      'Ingresa el código',
    ]);
    expect(
      (await errorsOf({ ...valid, code: 'x'.repeat(31) })).messages,
    ).toEqual(['El código tiene como máximo 30 caracteres']);
  });

  it('recorta el nombre y deja la marca en blanco como null', async () => {
    const { dto, messages } = await errorsOf({
      ...valid,
      name: '  Bujía de iridio ',
      brand: '  ',
    });
    expect(messages).toEqual([]);
    expect(dto.name).toBe('Bujía de iridio');
    expect(dto.brand).toBeNull();
  });

  it('limita el nombre y la marca al largo de sus columnas', async () => {
    expect(
      (await errorsOf({ ...valid, name: 'x'.repeat(151) })).messages,
    ).toEqual(['El nombre tiene como máximo 150 caracteres']);
    expect(
      (await errorsOf({ ...valid, brand: 'x'.repeat(61) })).messages,
    ).toEqual(['La marca tiene como máximo 60 caracteres']);
  });

  it('exige un tipo y una unidad de la lista', async () => {
    const { messages } = await errorsOf({
      ...valid,
      kind: 'TOOL',
      unit: 'BOX',
    });
    expect(messages).toEqual([
      'El tipo es PART (repuesto) o SUPPLY (insumo)',
      'La unidad es UNIT, LITER, GALLON, KIT o METER',
    ]);
  });

  it.each([
    ['4.5', '4.5'],
    [4.5, '4.5'],
    [0, '0'],
    [' 12 ', '12'],
  ])(
    'acepta el stock mínimo %j y lo deja como texto',
    async (minStock, text) => {
      const { dto, messages } = await errorsOf({ ...valid, minStock });
      expect(messages).toEqual([]);
      expect(dto.minStock).toBe(text);
    },
  );

  it.each([
    ['-1', 'El stock mínimo no puede ser negativo'],
    ['1.255', 'El stock mínimo tiene como máximo 2 decimales'],
    ['100000000', 'El stock mínimo es como máximo 99999999.99'],
    [
      'cuatro',
      'El stock mínimo es una cantidad con hasta 2 decimales, por ejemplo 4.50',
    ],
    ['', 'Ingresa el stock mínimo'],
    [undefined, 'Ingresa el stock mínimo'],
  ])('rechaza el stock mínimo %j', async (minStock, message) => {
    expect((await errorsOf({ ...valid, minStock })).messages).toEqual([
      message,
    ]);
  });

  it('valida el costo y el precio como montos en soles', async () => {
    const { dto, messages } = await errorsOf({
      ...valid,
      cost: 18.5,
      price: '30',
    });
    expect(messages).toEqual([]);
    expect(dto).toMatchObject({ cost: '18.5', price: '30' });

    expect(
      (await errorsOf({ ...valid, cost: '12.345', price: '-1' })).messages,
    ).toEqual([
      'El costo tiene como máximo 2 decimales',
      'El precio de venta no puede ser negativo',
    ]);
    expect(
      (await errorsOf({ ...valid, cost: undefined, price: '' })).messages,
    ).toEqual(['Ingresa el costo', 'Ingresa el precio de venta']);
  });

  it('acepta un precio menor que el costo: no es una regla (todavía)', async () => {
    expect(
      (await errorsOf({ ...valid, cost: '30', price: '25' })).messages,
    ).toEqual([]);
  });
});
