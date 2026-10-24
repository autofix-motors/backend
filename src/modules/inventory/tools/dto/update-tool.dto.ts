import { PartialType } from '@nestjs/swagger';
import { CreateToolDto } from './create-tool.dto.js';

// skipNullProperties: false hace que un `null` se valide como cualquier valor:
// con el default, `{ "name": null }` saltaba la validación y la base lo
// rechazaba con un 500. La marca, las notas y la asignación siguen aceptando
// null por su propio @IsOptional, que es como se borran (o como la
// herramienta vuelve al almacén).
export class UpdateToolDto extends PartialType(CreateToolDto, {
  skipNullProperties: false,
}) {}
