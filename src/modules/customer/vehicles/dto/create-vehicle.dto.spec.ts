import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateVehicleDto } from './create-vehicle.dto.js';

// Valida como lo hace el pipe global: transforma y se detiene en el primer
// error de cada campo.
async function errorsOf(body: Record<string, unknown>) {
  const dto = plainToInstance(CreateVehicleDto, body);
  const errors = await validate(dto, { stopAtFirstError: true });
  return {
    dto,
    messages: errors.flatMap((error) => Object.values(error.constraints ?? {})),
  };
}

const valid = {
  clienteId: '0b6f4a8e-3c1d-4e2f-9a7b-5c8d1e2f3a4b',
  placa: 'ABC123',
  marca: 'Toyota',
  modelo: 'Yaris',
};

describe('CreateVehicleDto', () => {
  it('normaliza la placa y el VIN', async () => {
    const { dto, messages } = await errorsOf({
      ...valid,
      placa: ' abc-123 ',
      vin: 'jtdbt9237 71234567',
    });
    expect(messages).toEqual([]);
    expect(dto.placa).toBe('ABC123');
    expect(dto.vin).toBe('JTDBT923771234567');
  });

  it.each([
    ['AB12', 'muy corta'],
    ['ABCD1234', 'muy larga'],
    ['AB*123', 'con símbolos'],
  ])('rechaza la placa %s (%s)', async (placa) => {
    const { messages } = await errorsOf({ ...valid, placa });
    expect(messages).toEqual(['La placa tiene de 5 a 7 letras o dígitos']);
  });

  it('rechaza un VIN con I, O o Q', async () => {
    const { messages } = await errorsOf({ ...valid, vin: 'JTDBT9237O1234567' });
    expect(messages).toEqual([
      'El VIN tiene 17 letras o dígitos, sin I, O ni Q',
    ]);
  });

  it('acepta el año siguiente al actual y no más', async () => {
    const next = new Date().getFullYear() + 1;
    expect((await errorsOf({ ...valid, anio: next })).messages).toEqual([]);
    expect((await errorsOf({ ...valid, anio: next + 1 })).messages).toEqual([
      `El año va de 1950 a ${next}`,
    ]);
    expect((await errorsOf({ ...valid, anio: 1949 })).messages).toEqual([
      `El año va de 1950 a ${next}`,
    ]);
  });

  it('deja vacíos los opcionales que llegan en blanco', async () => {
    const { dto, messages } = await errorsOf({
      ...valid,
      vin: ' ',
      color: '',
      notas: '  ',
    });
    expect(messages).toEqual([]);
    expect(dto.vin).toBeNull();
    expect(dto.color).toBeNull();
    expect(dto.notas).toBeNull();
  });

  it('exige el cliente, la marca y el modelo', async () => {
    const { messages } = await errorsOf({ placa: 'ABC123', marca: ' ' });
    expect(messages).toEqual([
      'Selecciona el cliente',
      'Ingresa la marca',
      'Ingresa el modelo',
    ]);
  });
});
