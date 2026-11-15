import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListProductsQueryDto } from './list-products-query.dto.js';

// La query llega toda como texto, como la entrega Express.
async function errorsOf(query: Record<string, string>) {
  const dto = plainToInstance(ListProductsQueryDto, query);
  const errors = await validate(dto, { stopAtFirstError: true });
  return {
    dto,
    messages: errors.flatMap((error) => Object.values(error.constraints ?? {})),
  };
}

describe('ListProductsQueryDto', () => {
  it('convierte el estado y el stock bajo, y ordena por nombre por defecto', async () => {
    const { dto, messages } = await errorsOf({
      tipo: 'INSUMO',
      activo: 'true',
      stockBajo: 'false',
    });
    expect(messages).toEqual([]);
    expect(dto).toMatchObject({
      tipo: 'INSUMO',
      activo: true,
      stockBajo: false,
      ordenarPor: 'nombre',
      sentido: 'asc',
    });
  });

  it('rechaza un tipo, un filtro de stock y un orden que no existen', async () => {
    const { messages } = await errorsOf({
      tipo: 'HERRAMIENTA',
      stockBajo: 'si',
      ordenarPor: 'costo',
    });
    expect(messages).toEqual([
      'El tipo es REPUESTO o INSUMO',
      'El filtro de stock bajo es true o false',
      'Se ordena por nombre, codigo, stock o precio',
    ]);
  });
});
