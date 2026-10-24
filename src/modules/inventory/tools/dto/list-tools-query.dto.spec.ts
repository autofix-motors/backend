import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListToolsQueryDto } from './list-tools-query.dto.js';

// La query llega toda como texto, como la entrega Express.
async function errorsOf(query: Record<string, string>) {
  const dto = plainToInstance(ListToolsQueryDto, query);
  const errors = await validate(dto, { stopAtFirstError: true });
  return {
    dto,
    messages: errors.flatMap((error) => Object.values(error.constraints ?? {})),
  };
}

describe('ListToolsQueryDto', () => {
  it('convierte el filtro de asignación y ordena por código por defecto', async () => {
    const { dto, messages } = await errorsOf({
      status: 'AVAILABLE',
      isAssigned: 'false',
    });
    expect(messages).toEqual([]);
    expect(dto).toMatchObject({
      status: 'AVAILABLE',
      isAssigned: false,
      sortBy: 'code',
      sortOrder: 'asc',
    });
  });

  it('rechaza un estado, un usuario, un filtro y un orden que no existen', async () => {
    const { messages } = await errorsOf({
      status: 'LOST',
      assignedToId: 'none',
      isAssigned: 'si',
      sortBy: 'brand',
    });
    expect(messages).toEqual([
      'El estado es AVAILABLE, IN_REPAIR o RETIRED',
      'El usuario no es válido',
      'El filtro de asignación es true o false',
      'Se ordena por code, name o status',
    ]);
  });
});
