import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { TrimToNull } from '../../../../core/validation/trim-to-null.transform.js';
import {
  DecisionChannel,
  QuoteStatus,
} from '../../../../generated/prisma/enums.js';

/** Lo que el cliente puede responder: todo o nada, no se aprueban ítems sueltos. */
export const QUOTE_DECISIONS = [
  QuoteStatus.APPROVED,
  QuoteStatus.REJECTED,
] as const;
export type QuoteDecision = (typeof QUOTE_DECISIONS)[number];

/**
 * La respuesta del cliente, que registra el administrador: el cliente no
 * aprueba desde la página pública (alcance del MVP).
 */
export class DecideQuoteDto {
  @ApiProperty({ enum: QUOTE_DECISIONS, enumName: 'QuoteDecision' })
  @IsIn(QUOTE_DECISIONS, {
    message: 'Indica si el cliente aprobó o rechazó el presupuesto',
  })
  decision: QuoteDecision;

  @ApiProperty({ enum: DecisionChannel, enumName: 'DecisionChannel' })
  @IsEnum(DecisionChannel, {
    message:
      'Indica por dónde respondió el cliente: PHONE, WHATSAPP o IN_PERSON',
  })
  channel: DecisionChannel;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 2000,
    example: 'Aprobó por WhatsApp; pide que lo llamen antes de entregar',
  })
  @IsOptional()
  @TrimToNull()
  @MaxLength(2000, { message: 'La nota tiene como máximo 2000 caracteres' })
  @IsString({ message: 'La nota tiene que ser texto' })
  note?: string | null;
}
