import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateServiceCatalogItemDto } from './create-service-catalog-item.dto.js';

// Valida como lo hace el pipe global: transforma y se detiene en el primer
// error de cada campo.
async function errorsOf(body: Record<string, unknown>) {
  const dto = plainToInstance(CreateServiceCatalogItemDto, body);
  const errors = await validate(dto, { stopAtFirstError: true });
  return {
    dto,
    messages: errors.flatMap((error) => Object.values(error.constraints ?? {})),
  };
}

const valid = { name: 'Afinamiento', laborPrice: '180.00' };

describe('CreateServiceCatalogItemDto', () => {
  it.each([
    ['120', '120'],
    [' 120.5 ', '120.5'],
    [120.5, '120.5'],
    [0, '0'],
    ['99999999.99', '99999999.99'],
  ])('acepta el precio %j y lo deja como texto', async (laborPrice, text) => {
    const { dto, messages } = await errorsOf({ ...valid, laborPrice });
    expect(messages).toEqual([]);
    expect(dto.laborPrice).toBe(text);
  });

  it.each([
    ['12.345', 'El precio de mano de obra tiene como máximo 2 decimales'],
    [12.345, 'El precio de mano de obra tiene como máximo 2 decimales'],
    ['-5', 'El precio de mano de obra no puede ser negativo'],
    [-5, 'El precio de mano de obra no puede ser negativo'],
    ['100000000', 'El precio de mano de obra es como máximo 99999999.99'],
    [
      '12,50',
      'El precio de mano de obra es un monto en soles con hasta 2 decimales, por ejemplo 120.50',
    ],
    [
      '1e3',
      'El precio de mano de obra es un monto en soles con hasta 2 decimales, por ejemplo 120.50',
    ],
    [
      true,
      'El precio de mano de obra es un monto en soles con hasta 2 decimales, por ejemplo 120.50',
    ],
    ['', 'Ingresa el precio de mano de obra'],
    [undefined, 'Ingresa el precio de mano de obra'],
  ])('rechaza el precio %j', async (laborPrice, message) => {
    const { messages } = await errorsOf({ ...valid, laborPrice });
    expect(messages).toEqual([message]);
  });

  it('recorta el nombre y deja vacía la descripción en blanco', async () => {
    const { dto, messages } = await errorsOf({
      ...valid,
      name: '  Lavado de motor ',
      description: '   ',
    });
    expect(messages).toEqual([]);
    expect(dto.name).toBe('Lavado de motor');
    expect(dto.description).toBeNull();
  });

  it('rechaza un nombre vacío o demasiado largo', async () => {
    expect((await errorsOf({ ...valid, name: '  ' })).messages).toEqual([
      'Ingresa el nombre del servicio',
    ]);
    expect(
      (await errorsOf({ ...valid, name: 'x'.repeat(121) })).messages,
    ).toEqual(['El nombre tiene como máximo 120 caracteres']);
  });
});
