import { PartialType } from '@nestjs/swagger';
import { CreateServiceCatalogItemDto } from './create-service-catalog-item.dto.js';

// skipNullProperties: false hace que un `null` se valide como cualquier valor:
// con el default, `{ "name": null }` saltaba la validación y la base lo
// rechazaba con un 500. La descripción sigue aceptando null por su propio
// @IsOptional, que es como se borra.
export class UpdateServiceCatalogItemDto extends PartialType(
  CreateServiceCatalogItemDto,
  { skipNullProperties: false },
) {}
