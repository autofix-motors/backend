import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Una nota en la línea de tiempo, sin cambiar el estado. `isPublic` es
 * obligatorio a propósito: quien escribe decide si la ve el cliente, en vez de
 * que una nota interna se publique por omisión.
 */
export class CreateWorkOrderNoteDto {
  @ApiProperty({
    example: 'Se pidió la pastilla de freno al proveedor',
    maxLength: 2000,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(2000, { message: 'La nota tiene como máximo 2000 caracteres' })
  @IsNotEmpty({ message: 'Escribe la nota' })
  @IsString({ message: 'Escribe la nota' })
  note: string;

  @ApiProperty({ description: 'Si el cliente la ve en el seguimiento' })
  @IsBoolean({ message: 'Indica si el cliente ve la nota (true o false)' })
  isPublic: boolean;
}
