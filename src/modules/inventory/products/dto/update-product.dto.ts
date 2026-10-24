import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto.js';

// skipNullProperties: false hace que un `null` se valide como cualquier valor:
// con el default, `{ "name": null }` saltaba la validación y la base lo
// rechazaba con un 500. La marca sigue aceptando null por su propio
// @IsOptional, que es como se borra. Tampoco aquí entra el `stock`: solo lo
// mueven los movimientos (ver CreateProductDto).
export class UpdateProductDto extends PartialType(CreateProductDto, {
  skipNullProperties: false,
}) {}
