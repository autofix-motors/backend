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
      kind: 'SUPPLY',
      isActive: 'true',
      lowStock: 'false',
    });
    expect(messages).toEqual([]);
    expect(dto).toMatchObject({
      kind: 'SUPPLY',
      isActive: true,
      lowStock: false,
      sortBy: 'name',
      sortOrder: 'asc',
    });
  });

  it('rechaza un tipo, un filtro de stock y un orden que no existen', async () => {
    const { messages } = await errorsOf({
      kind: 'TOOL',
      lowStock: 'si',
      sortBy: 'cost',
    });
    expect(messages).toEqual([
      'El tipo es PART o SUPPLY',
      'El filtro de stock bajo es true o false',
      'Se ordena por name, code, stock o price',
    ]);
  });
});
