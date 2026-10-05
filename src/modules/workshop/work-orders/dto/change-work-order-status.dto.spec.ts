import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangeWorkOrderStatusDto } from './change-work-order-status.dto.js';

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

describe('ChangeWorkOrderStatusDto', () => {
  it('acepta el estado solo; la nota vacía queda en null', async () => {
    const { dto, messages } = await check(ChangeWorkOrderStatusDto, {
      status: 'IN_PROGRESS',
      note: '   ',
    });
    expect(messages).toEqual([]);
    expect(dto.note).toBeNull();
    expect(dto.isPublic).toBeUndefined();
  });

  it('pide un estado que exista', async () => {
    expect((await check(ChangeWorkOrderStatusDto, {})).messages).toEqual([
      'El estado no es válido',
    ]);
    expect(
      (await check(ChangeWorkOrderStatusDto, { status: 'FINISHED' })).messages,
    ).toEqual(['El estado no es válido']);
  });

  it('isPublic es opcional pero no anulable', async () => {
    expect(
      (
        await check(ChangeWorkOrderStatusDto, {
          status: 'READY',
          isPublic: null,
          note: 'x'.repeat(2001),
        })
      ).messages,
    ).toEqual([
      'La nota tiene como máximo 2000 caracteres',
      'Indica si el cliente ve el cambio (true o false)',
    ]);
  });
});
