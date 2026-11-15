import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { TrimToNull } from '../../../../core/validation/trim-to-null.transform.js';
import {
  CanalDecision,
  EstadoPresupuesto,
} from '../../../../generated/prisma/enums.js';

/** Lo que el cliente puede responder: todo o nada, no se aprueban detalles sueltos. */
export const QUOTE_DECISIONS = [
  EstadoPresupuesto.APROBADO,
  EstadoPresupuesto.RECHAZADO,
] as const;
export type QuoteDecision = (typeof QUOTE_DECISIONS)[number];

/**
 * Por dónde le respondió el cliente al administrador. Sin PORTAL: ese canal lo
 * registra solo el propio cliente desde su cuenta.
 */
export const STAFF_DECISION_CHANNELS = [
  CanalDecision.TELEFONO,
  CanalDecision.WHATSAPP,
  CanalDecision.EN_PERSONA,
] as const;
export type StaffDecisionChannel = (typeof STAFF_DECISION_CHANNELS)[number];

/**
 * La respuesta del cliente que registra el administrador (por llamada, WhatsApp
 * o en el taller). La que da el cliente desde su portal entra por
 * `/portal/…/decision`.
 */
export class DecideQuoteDto {
  @ApiProperty({ enum: QUOTE_DECISIONS, enumName: 'DecisionPresupuesto' })
  @IsIn(QUOTE_DECISIONS, {
    message: 'Indica si el cliente aprobó o rechazó el presupuesto',
  })
  decision: QuoteDecision;

  @ApiProperty({
    enum: STAFF_DECISION_CHANNELS,
    enumName: 'CanalDecisionPersonal',
  })
  @IsIn(STAFF_DECISION_CHANNELS, {
    message:
      'Indica por dónde respondió el cliente: TELEFONO, WHATSAPP o EN_PERSONA',
  })
  canal: StaffDecisionChannel;

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
  nota?: string | null;
}
