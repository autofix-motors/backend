import { PickType } from '@nestjs/swagger';
import { DecideQuoteDto } from '../../work-orders/dto/decide-quote.dto.js';

/**
 * La respuesta del cliente desde su portal: aprobado o rechazado (todo o
 * nada) y una nota opcional. Sin canal: es el portal.
 */
export class DecidePortalQuoteDto extends PickType(DecideQuoteDto, [
  'decision',
  'note',
] as const) {}
