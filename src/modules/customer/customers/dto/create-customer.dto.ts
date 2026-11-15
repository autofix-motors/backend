import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { TrimToNull } from '../../../../core/validation/trim-to-null.transform.js';
import { TipoDocumento } from '../../../../generated/prisma/enums.js';
import {
  documentNumberError,
  normalizeDocumentNumber,
} from '../../../../shared/document-number.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Valida el número contra el tipo del mismo cuerpo. Si el cuerpo no trae el
 * tipo (una edición que solo cambia el número), lo valida el service contra el
 * tipo guardado.
 */
@ValidatorConstraint({ name: 'documentNumberMatchesType' })
export class DocumentNumberMatchesType implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    return !mismatch(value, args);
  }

  defaultMessage(args: ValidationArguments): string {
    return mismatch(args.value, args) ?? '';
  }
}

function mismatch(value: unknown, args: ValidationArguments): string | null {
  const { tipoDocumento } = args.object as { tipoDocumento?: unknown };
  const isType = Object.values(TipoDocumento).includes(
    tipoDocumento as TipoDocumento,
  );
  if (typeof value !== 'string' || !isType) return null;
  return documentNumberError(tipoDocumento as TipoDocumento, value);
}

export class CreateCustomerDto {
  @ApiProperty({ enum: TipoDocumento, enumName: 'TipoDocumento' })
  @IsEnum(TipoDocumento, {
    message: 'El tipo de documento es DNI, RUC, CE o PASAPORTE',
  })
  tipoDocumento: TipoDocumento;

  @ApiProperty({ example: '45678912', maxLength: 20 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeDocumentNumber(value) : value,
  )
  @Validate(DocumentNumberMatchesType)
  @MaxLength(20, { message: 'El número de documento es demasiado largo' })
  @IsNotEmpty({ message: 'Ingresa el número de documento' })
  // class-validator evalúa de abajo hacia arriba y se detiene en el primer
  // error: el chequeo más básico va al final.
  @IsString({ message: 'Ingresa el número de documento' })
  numeroDocumento: string;

  @ApiProperty({ example: 'Juan Pérez Rojas', maxLength: 150 })
  @Transform(trim)
  @MaxLength(150, { message: 'El nombre tiene como máximo 150 caracteres' })
  @IsNotEmpty({ message: 'Ingresa el nombre o la razón social' })
  @IsString({ message: 'Ingresa el nombre o la razón social' })
  nombre: string;

  @ApiProperty({ example: '987654321', maxLength: 20 })
  // Se guarda sin espacios, guiones ni paréntesis: es lo que se usa para armar
  // el enlace de WhatsApp.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value,
  )
  @Matches(/^\+?\d{6,15}$/, {
    message: 'El teléfono tiene de 6 a 15 dígitos y puede empezar con +',
  })
  @IsString({ message: 'Ingresa el teléfono' })
  telefono: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'juan@correo.pe',
  })
  @IsOptional()
  // En minúsculas, como el del personal: también sirve para entrar al portal,
  // y «Juan@Correo.pe» y «juan@correo.pe» son la misma persona. Vacío es «sin
  // correo», igual que con TrimToNull.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() || null : value,
  )
  @MaxLength(254, { message: 'El correo es demasiado largo' })
  @IsEmail({}, { message: 'Ingresa un correo válido' })
  correo?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 250 })
  @IsOptional()
  @TrimToNull()
  @MaxLength(250, { message: 'La dirección tiene como máximo 250 caracteres' })
  @IsString({ message: 'La dirección tiene que ser texto' })
  direccion?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @TrimToNull()
  @MaxLength(1000, { message: 'Las notas tienen como máximo 1000 caracteres' })
  @IsString({ message: 'Las notas tienen que ser texto' })
  notas?: string | null;

  @ApiPropertyOptional({ default: true })
  // Opcional pero no anulable: con @IsOptional un `null` pasaría sin validar y
  // la base lo rechazaría con un 500 (la columna no admite vacío).
  @ValidateIf((_dto: CreateCustomerDto, value: unknown) => value !== undefined)
  @IsBoolean({ message: 'El estado tiene que ser verdadero o falso' })
  activo?: boolean;
}
