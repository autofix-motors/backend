import { PartialType } from '@nestjs/swagger';
import { CreateCustomerDto } from './create-customer.dto.js';

// skipNullProperties: false hace que un `null` se valide como cualquier valor.
// Con el default, `{ "name": null }` saltaba la validación y la base lo
// rechazaba con un 500. Los opcionales (correo, notas…) siguen aceptando null
// por su propio @IsOptional, que es como se borra el dato.
export class UpdateCustomerDto extends PartialType(CreateCustomerDto, {
  skipNullProperties: false,
}) {}
