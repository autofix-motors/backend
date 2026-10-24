import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateQuoteDto } from './create-quote.dto.js';

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

describe('CreateQuoteDto', () => {
  it('el cuerpo vacío vale: la nota es opcional y vacía queda en null', async () => {
    expect((await check(CreateQuoteDto, {})).messages).toEqual([]);
    const { dto, messages } = await check(CreateQuoteDto, { note: '   ' });
    expect(messages).toEqual([]);
    expect(dto.note).toBeNull();
  });

  it('los ítems y el total no viajan: salen de la orden', async () => {
    expect(
      (await check(CreateQuoteDto, { total: '1.00', items: [] })).messages,
    ).toEqual(['no permitido: total', 'no permitido: items']);
  });

  it('la nota tiene como máximo 2000 caracteres y es texto', async () => {
    expect(
      (await check(CreateQuoteDto, { note: 'x'.repeat(2001) })).messages,
    ).toEqual(['La nota tiene como máximo 2000 caracteres']);
    expect((await check(CreateQuoteDto, { note: 5 })).messages).toEqual([
      'La nota tiene que ser texto',
    ]);
  });
});
