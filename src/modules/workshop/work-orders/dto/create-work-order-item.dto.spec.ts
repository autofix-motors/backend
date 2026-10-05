import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateWorkOrderItemDto } from './create-work-order-item.dto.js';
import { UpdateWorkOrderItemDto } from './update-work-order-item.dto.js';

// Igual que el pipe global: lista blanca estricta y un mensaje por campo.
async function check<T extends object>(
  type: ClassConstructor<T>,
  body: Record<string, unknown>,
) {
  const dto = plainToInstance(type, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
    stopAtFirstError: true,
  });
  return {
    dto,
    messages: errors.flatMap((error) =>
      Object.entries(error.constraints ?? {}).map(([rule, message]) =>
        rule === 'whitelistValidation'
          ? `no permitido: ${error.property}`
          : message,
      ),
    ),
  };
}

const SERVICE_ID = '7a1c4f0e-2b3d-4e5f-8a9b-0c1d2e3f4a5b';
const PRODUCT_ID = '3f2e1d0c-9b8a-4f6e-8d4c-3b2a1f0e9d8c';

describe('CreateWorkOrderItemDto', () => {
  it('un servicio solo necesita el tipo y el servicio', async () => {
    const { dto, messages } = await check(CreateWorkOrderItemDto, {
      type: 'SERVICE',
      serviceCatalogItemId: SERVICE_ID,
    });
    expect(messages).toEqual([]);
    expect(dto.quantity).toBeUndefined();
  });

  it('el original es obligatorio según el tipo', async () => {
    expect(
      (await check(CreateWorkOrderItemDto, { type: 'SERVICE' })).messages,
    ).toEqual(['Selecciona el servicio']);
    expect(
      (
        await check(CreateWorkOrderItemDto, {
          type: 'PRODUCT',
          serviceCatalogItemId: SERVICE_ID,
        })
      ).messages,
    ).toEqual(['Selecciona el repuesto']);
    expect(
      (await check(CreateWorkOrderItemDto, { type: 'TOOL' })).messages,
    ).toEqual(['El tipo de ítem es SERVICE o PRODUCT']);
  });

  it('la cantidad y el precio llegan como texto, sin pasar por un número', async () => {
    const { dto, messages } = await check(CreateWorkOrderItemDto, {
      type: 'PRODUCT',
      productId: PRODUCT_ID,
      quantity: 1.5,
      unitPrice: ' 38.90 ',
    });
    expect(messages).toEqual([]);
    expect(dto.quantity).toBe('1.5');
    expect(dto.unitPrice).toBe('38.90');
  });

  it('la cantidad es mayor que 0 y con hasta 2 decimales; null no pasa', async () => {
    const quantity = async (value: unknown) =>
      (
        await check(CreateWorkOrderItemDto, {
          type: 'PRODUCT',
          productId: PRODUCT_ID,
          quantity: value,
        })
      ).messages;
    expect(await quantity('0')).toEqual([
      'La cantidad tiene que ser mayor que 0',
    ]);
    expect(await quantity('-1')).toEqual([
      'La cantidad tiene que ser mayor que 0',
    ]);
    expect(await quantity('1.255')).toEqual([
      'La cantidad tiene como máximo 2 decimales',
    ]);
    expect(await quantity(null)).toHaveLength(1);
  });

  it('el precio no es negativo y la descripción no queda vacía', async () => {
    const { messages } = await check(CreateWorkOrderItemDto, {
      type: 'SERVICE',
      serviceCatalogItemId: SERVICE_ID,
      unitPrice: '-5',
      description: '   ',
    });
    expect(messages).toEqual([
      'El precio unitario no puede ser negativo',
      'Escribe la descripción del ítem',
    ]);
  });

  it('no acepta campos de más', async () => {
    expect(
      (
        await check(CreateWorkOrderItemDto, {
          type: 'SERVICE',
          serviceCatalogItemId: SERVICE_ID,
          unitCost: '10',
        })
      ).messages,
    ).toEqual(['no permitido: unitCost']);
  });
});

describe('UpdateWorkOrderItemDto', () => {
  it('acepta solo algunos campos', async () => {
    expect(
      (await check(UpdateWorkOrderItemDto, { quantity: '2' })).messages,
    ).toEqual([]);
  });

  it('rechaza null en vez de dejarlo llegar a la base', async () => {
    const { messages } = await check(UpdateWorkOrderItemDto, {
      quantity: null,
      unitPrice: null,
      description: null,
    });
    expect(messages).toHaveLength(3);
  });

  it('el tipo y el original no se cambian', async () => {
    expect(
      (
        await check(UpdateWorkOrderItemDto, {
          type: 'PRODUCT',
          productId: PRODUCT_ID,
        })
      ).messages,
    ).toEqual(['no permitido: type', 'no permitido: productId']);
  });
});
