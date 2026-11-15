import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateServiceCatalogItemDto } from './update-service-catalog-item.dto.js';

async function messagesOf(body: Record<string, unknown>) {
  const dto = plainToInstance(UpdateServiceCatalogItemDto, body);
  const errors = await validate(dto, { stopAtFirstError: true });
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('UpdateServiceCatalogItemDto', () => {
  it('acepta un cuerpo con solo algunos campos', async () => {
    expect(await messagesOf({ activo: false })).toEqual([]);
    expect(await messagesOf({ precioManoObra: 95 })).toEqual([]);
  });

  it('rechaza null en un campo obligatorio, en vez de dejarlo llegar a la base', async () => {
    expect(await messagesOf({ nombre: null })).toEqual([
      'Ingresa el nombre del servicio',
    ]);
    expect(await messagesOf({ precioManoObra: null })).toEqual([
      'Ingresa el precio de mano de obra',
    ]);
  });

  it('acepta null en la descripción: así se borra', async () => {
    expect(await messagesOf({ descripcion: null })).toEqual([]);
  });
});

describe('UpdateServiceCatalogItemDto: estado', () => {
  it('rechaza activo en null: la columna no admite vacío', async () => {
    expect(await messagesOf({ activo: null })).toEqual([
      'El estado tiene que ser verdadero o falso',
    ]);
  });
});
