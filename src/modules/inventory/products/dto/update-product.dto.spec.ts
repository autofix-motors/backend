import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProductDto } from './update-product.dto.js';

async function messagesOf(body: Record<string, unknown>) {
  const dto = plainToInstance(UpdateProductDto, body);
  const errors = await validate(dto, { stopAtFirstError: true });
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('UpdateProductDto', () => {
  it('acepta un cuerpo con solo algunos campos', async () => {
    expect(await messagesOf({ activo: false })).toEqual([]);
    expect(await messagesOf({ stockMinimo: 2, precio: '35.90' })).toEqual([]);
  });

  it('rechaza null en un campo obligatorio, en vez de dejarlo llegar a la base', async () => {
    expect(await messagesOf({ nombre: null })).toEqual([
      'Ingresa el nombre del producto',
    ]);
    expect(await messagesOf({ codigo: null })).toEqual(['Ingresa el código']);
    expect(await messagesOf({ tipo: null })).toEqual([
      'El tipo es REPUESTO o INSUMO',
    ]);
    expect(await messagesOf({ stockMinimo: null })).toEqual([
      'Ingresa el stock mínimo',
    ]);
    expect(await messagesOf({ costo: null })).toEqual(['Ingresa el costo']);
  });

  it('acepta null en la marca: así se borra', async () => {
    expect(await messagesOf({ marca: null })).toEqual([]);
  });
});

describe('UpdateProductDto: estado', () => {
  it('rechaza activo en null: la columna no admite vacío', async () => {
    expect(await messagesOf({ activo: null })).toEqual([
      'El estado tiene que ser verdadero o falso',
    ]);
  });
});
