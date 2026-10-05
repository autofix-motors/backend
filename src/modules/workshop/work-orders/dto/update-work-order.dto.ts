import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateWorkOrderDto } from './create-work-order.dto.js';

// El vehículo no se cambia: una orden es un ingreso de ese vehículo, y su
// cliente se congeló con él. Si se registró el vehículo equivocado, se borra o
// se cancela y se registra otra.
//
// skipNullProperties: false hace que un `null` se valide como cualquier valor:
// `{ "reason": null }` es un 400 y no un 500 de la base. La fecha prometida y
// el mecánico siguen aceptando null por su propio @IsOptional, que es como se
// quitan.
export class UpdateWorkOrderDto extends PartialType(
  OmitType(CreateWorkOrderDto, ['vehicleId'] as const),
  { skipNullProperties: false },
) {}
