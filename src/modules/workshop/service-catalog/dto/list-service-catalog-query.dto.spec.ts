import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListServiceCatalogQueryDto } from './list-service-catalog-query.dto.js';

// La query llega toda como texto, como la entrega Express.
async function errorsOf(query: Record<string, string>) {
  const dto = plainToInstance(ListServiceCatalogQueryDto, query);
  const errors = await validate(dto, { stopAtFirstError: true });
  return {
    dto,
    messages: errors.flatMap((error) => Object.values(error.constraints ?? {})),
  };
}

describe('ListServiceCatalogQueryDto', () => {
  it('convierte el estado y deja el rango de precio como texto', async () => {
    const { dto, messages } = await errorsOf({
      isActive: 'false',
      minPrice: ' 50 ',
      maxPrice: '200.5',
    });
    expect(messages).toEqual([]);
    expect(dto).toMatchObject({
      isActive: false,
      minPrice: '50',
      maxPrice: '200.5',
      sortBy: 'name',
      sortOrder: 'asc',
    });
  });

  it('un precio vacío es lo mismo que no filtrar', async () => {
    const { dto, messages } = await errorsOf({ minPrice: '', maxPrice: ' ' });
    expect(messages).toEqual([]);
    expect(dto.minPrice).toBeUndefined();
    expect(dto.maxPrice).toBeUndefined();
  });

  it('rechaza un precio mal escrito y un orden que no existe', async () => {
    const { messages } = await errorsOf({
      minPrice: '-1',
      maxPrice: 'abc',
      sortBy: 'description',
    });
    expect(messages).toEqual([
      'El precio mínimo no puede ser negativo',
      'El precio máximo es un monto en soles con hasta 2 decimales, por ejemplo 120.50',
      'Se ordena por name, laborPrice o createdAt',
    ]);
  });
});
