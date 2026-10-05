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
    expect(await messagesOf({ isActive: false })).toEqual([]);
    expect(await messagesOf({ minStock: 2, price: '35.90' })).toEqual([]);
  });

  it('rechaza null en un campo obligatorio, en vez de dejarlo llegar a la base', async () => {
    expect(await messagesOf({ name: null })).toEqual([
      'Ingresa el nombre del producto',
    ]);
    expect(await messagesOf({ code: null })).toEqual(['Ingresa el código']);
    expect(await messagesOf({ kind: null })).toEqual([
      'El tipo es PART (repuesto) o SUPPLY (insumo)',
    ]);
    expect(await messagesOf({ minStock: null })).toEqual([
      'Ingresa el stock mínimo',
    ]);
    expect(await messagesOf({ cost: null })).toEqual(['Ingresa el costo']);
  });

  it('acepta null en la marca: así se borra', async () => {
    expect(await messagesOf({ brand: null })).toEqual([]);
  });
});
