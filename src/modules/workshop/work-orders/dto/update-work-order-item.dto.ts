import { PartialType, PickType } from '@nestjs/swagger';
import { CreateWorkOrderItemDto } from './create-work-order-item.dto.js';

// Lo que se puede cambiar de un ítem: la cantidad (solo de un servicio: la de
// un repuesto ya movió el stock, y se corrige quitándolo y volviéndolo a
// agregar), y para el administrador, el precio y la descripción. El tipo y el
// original no cambian: eso es otro ítem.
//
// skipNullProperties: false hace que un `null` se valide como cualquier valor:
// `{ "quantity": null }` es un 400 y no un 500 de la base.
export class UpdateWorkOrderItemDto extends PartialType(
  PickType(CreateWorkOrderItemDto, [
    'quantity',
    'unitPrice',
    'description',
  ] as const),
  { skipNullProperties: false },
) {}
