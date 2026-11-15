import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCustomerDto } from './create-customer.dto.js';

// Valida como lo hace el pipe global: transforma y se detiene en el primer
// error de cada campo.
async function errorsOf(body: Record<string, unknown>) {
  const dto = plainToInstance(CreateCustomerDto, body);
  const errors = await validate(dto, { stopAtFirstError: true });
  return {
    dto,
    messages: errors.flatMap((error) => Object.values(error.constraints ?? {})),
  };
}

const valid = {
  tipoDocumento: 'DNI',
  numeroDocumento: '45678912',
  nombre: 'Juan Pérez',
  telefono: '987 654 321',
};

describe('CreateCustomerDto', () => {
  it('normaliza el documento y el teléfono', async () => {
    const { dto, messages } = await errorsOf({
      ...valid,
      tipoDocumento: 'RUC',
      numeroDocumento: '20-123456789 ',
    });
    expect(messages).toEqual([]);
    expect(dto.numeroDocumento).toBe('20123456789');
    expect(dto.telefono).toBe('987654321');
  });

  it.each([
    ['DNI', '1234567', 'El DNI tiene 8 dígitos'],
    [
      'RUC',
      '30123456789',
      'El RUC tiene 11 dígitos y empieza en 10, 15, 16, 17 o 20',
    ],
    ['CE', 'AB1', 'El carné de extranjería tiene de 6 a 12 letras o dígitos'],
  ])(
    'rechaza un %s mal formado',
    async (tipoDocumento, numeroDocumento, message) => {
      const { messages } = await errorsOf({
        ...valid,
        tipoDocumento,
        numeroDocumento,
      });
      expect(messages).toEqual([message]);
    },
  );

  it('deja vacíos los opcionales que llegan en blanco', async () => {
    const { dto, messages } = await errorsOf({
      ...valid,
      correo: '  ',
      notas: '',
    });
    expect(messages).toEqual([]);
    expect(dto.correo).toBeNull();
    expect(dto.notas).toBeNull();
  });
});
