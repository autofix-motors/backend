import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { DecideQuoteDto } from './decide-quote.dto.js';

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

describe('DecideQuoteDto', () => {
  it('acepta aprobado o rechazado con su canal; la nota se recorta', async () => {
    const { dto, messages } = await check(DecideQuoteDto, {
      decision: 'APPROVED',
      channel: 'WHATSAPP',
      note: '  Pide que lo llamen antes  ',
    });
    expect(messages).toEqual([]);
    expect(dto.note).toBe('Pide que lo llamen antes');
  });

  it('la decisión y el canal son obligatorios', async () => {
    expect((await check(DecideQuoteDto, {})).messages).toEqual([
      'Indica si el cliente aprobó o rechazó el presupuesto',
      'Indica por dónde respondió el cliente: PHONE, WHATSAPP o IN_PERSON',
    ]);
  });

  it('no se «decide» un estado que no es una respuesta del cliente', async () => {
    for (const decision of ['PENDING', 'SUPERSEDED', null]) {
      expect(
        (await check(DecideQuoteDto, { decision, channel: 'PHONE' })).messages,
      ).toEqual(['Indica si el cliente aprobó o rechazó el presupuesto']);
    }
  });

  it('el taller no puede registrar el canal PORTAL: ese lo usa solo el cliente', async () => {
    expect(
      (await check(DecideQuoteDto, { decision: 'APPROVED', channel: 'PORTAL' }))
        .messages,
    ).toEqual([
      'Indica por dónde respondió el cliente: PHONE, WHATSAPP o IN_PERSON',
    ]);
  });

  it('el canal es uno de los tres', async () => {
    expect(
      (await check(DecideQuoteDto, { decision: 'REJECTED', channel: 'EMAIL' }))
        .messages,
    ).toEqual([
      'Indica por dónde respondió el cliente: PHONE, WHATSAPP o IN_PERSON',
    ]);
  });

  it('no se aprueban ítems sueltos: un campo de más es un error', async () => {
    expect(
      (
        await check(DecideQuoteDto, {
          decision: 'APPROVED',
          channel: 'PHONE',
          items: ['qi-1'],
        })
      ).messages,
    ).toEqual(['no permitido: items']);
  });
});
