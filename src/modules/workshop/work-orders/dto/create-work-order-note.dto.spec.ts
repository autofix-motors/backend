import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateWorkOrderNoteDto } from './create-work-order-note.dto.js';

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

describe('CreateWorkOrderNoteDto', () => {
  it('pide la nota y si es pública, sin suponerlo', async () => {
    expect(
      (await check(CreateWorkOrderNoteDto, { nota: '  ' })).messages,
    ).toEqual([
      'Escribe la nota',
      'Indica si el cliente ve la nota (true o false)',
    ]);
    const { dto, messages } = await check(CreateWorkOrderNoteDto, {
      nota: ' Repuesto en camino ',
      esPublico: true,
    });
    expect(messages).toEqual([]);
    expect(dto.nota).toBe('Repuesto en camino');
  });
});
