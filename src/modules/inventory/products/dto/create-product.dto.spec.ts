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
  codigo: 'FA-001',
  nombre: 'Filtro de aceite',
  tipo: 'REPUESTO',
  unidad: 'UNIDAD',
  stockMinimo: '4',
  costo: '12.50',
  precio: '25',
};

describe('CreateProductDto', () => {
  it('deja el código en mayúsculas y sin espacios en los extremos', async () => {
    const { dto, messages } = await errorsOf({
      ...valid,
      codigo: '  fa-toy 01 ',
    });
    expect(messages).toEqual([]);
    expect(dto.codigo).toBe('FA-TOY 01');
  });

  it('rechaza un código vacío o demasiado largo', async () => {
    expect((await errorsOf({ ...valid, codigo: '   ' })).messages).toEqual([
      'Ingresa el código',
    ]);
    expect(
      (await errorsOf({ ...valid, codigo: 'x'.repeat(31) })).messages,
    ).toEqual(['El código tiene como máximo 30 caracteres']);
  });

  it('recorta el nombre y deja la marca en blanco como null', async () => {
    const { dto, messages } = await errorsOf({
      ...valid,
      nombre: '  Bujía de iridio ',
      marca: '  ',
    });
    expect(messages).toEqual([]);
    expect(dto.nombre).toBe('Bujía de iridio');
    expect(dto.marca).toBeNull();
  });

  it('limita el nombre y la marca al largo de sus columnas', async () => {
    expect(
      (await errorsOf({ ...valid, nombre: 'x'.repeat(151) })).messages,
    ).toEqual(['El nombre tiene como máximo 150 caracteres']);
    expect(
      (await errorsOf({ ...valid, marca: 'x'.repeat(61) })).messages,
    ).toEqual(['La marca tiene como máximo 60 caracteres']);
  });

  it('exige un tipo y una unidad de la lista', async () => {
    const { messages } = await errorsOf({
      ...valid,
      tipo: 'HERRAMIENTA',
      unidad: 'CAJA',
    });
    expect(messages).toEqual([
      'El tipo es REPUESTO o INSUMO',
      'La unidad es UNIDAD, LITRO, GALON, KIT o METRO',
    ]);
  });

  it.each([
    ['4.5', '4.5'],
    [4.5, '4.5'],
    [0, '0'],
    [' 12 ', '12'],
  ])(
    'acepta el stock mínimo %j y lo deja como texto',
    async (stockMinimo, text) => {
      const { dto, messages } = await errorsOf({ ...valid, stockMinimo });
      expect(messages).toEqual([]);
      expect(dto.stockMinimo).toBe(text);
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
  ])('rechaza el stock mínimo %j', async (stockMinimo, message) => {
    expect((await errorsOf({ ...valid, stockMinimo })).messages).toEqual([
      message,
    ]);
  });

  it('valida el costo y el precio como montos en soles', async () => {
    const { dto, messages } = await errorsOf({
      ...valid,
      costo: 18.5,
      precio: '30',
    });
    expect(messages).toEqual([]);
    expect(dto).toMatchObject({ costo: '18.5', precio: '30' });

    expect(
      (await errorsOf({ ...valid, costo: '12.345', precio: '-1' })).messages,
    ).toEqual([
      'El costo tiene como máximo 2 decimales',
      'El precio de venta no puede ser negativo',
    ]);
    expect(
      (await errorsOf({ ...valid, costo: undefined, precio: '' })).messages,
    ).toEqual(['Ingresa el costo', 'Ingresa el precio de venta']);
  });

  it('acepta un precio menor que el costo: no es una regla (todavía)', async () => {
    expect(
      (await errorsOf({ ...valid, costo: '30', precio: '25' })).messages,
    ).toEqual([]);
  });
});
