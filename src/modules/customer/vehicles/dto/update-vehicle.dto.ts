import { PartialType } from '@nestjs/swagger';
import { CreateVehicleDto } from './create-vehicle.dto.js';

// Igual que en clientes: un null en un campo obligatorio se valida y responde
// 400, en vez de llegar a la base como un 500. Los opcionales lo aceptan.
export class UpdateVehicleDto extends PartialType(CreateVehicleDto, {
  skipNullProperties: false,
}) {}
