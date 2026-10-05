import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateWorkOrderDiagnosisDto } from './update-work-order-diagnosis.dto.js';

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

describe('UpdateWorkOrderDiagnosisDto', () => {
  it('la clave es obligatoria: un cuerpo vacío no borra el diagnóstico', async () => {
    expect((await check(UpdateWorkOrderDiagnosisDto, {})).messages).toEqual([
      'Escribe el diagnóstico, o null para borrarlo',
    ]);
  });

  it('null o texto vacío lo borran; el texto se recorta', async () => {
    for (const diagnosis of [null, '   ']) {
      const { dto, messages } = await check(UpdateWorkOrderDiagnosisDto, {
        diagnosis,
      });
      expect(messages).toEqual([]);
      expect(dto.diagnosis).toBeNull();
    }
    const { dto } = await check(UpdateWorkOrderDiagnosisDto, {
      diagnosis: ' Pastillas gastadas ',
    });
    expect(dto.diagnosis).toBe('Pastillas gastadas');
  });

  it('hasta 4000 caracteres', async () => {
    expect(
      (
        await check(UpdateWorkOrderDiagnosisDto, {
          diagnosis: 'x'.repeat(4001),
        })
      ).messages,
    ).toEqual(['El diagnóstico tiene como máximo 4000 caracteres']);
  });
});
