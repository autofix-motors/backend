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
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { TrimToNull } from '../../../../core/validation/trim-to-null.transform.js';
import { DocumentType } from '../../../../generated/prisma/enums.js';
import {
  documentNumberError,
  normalizeDocumentNumber,
} from '../document-number.js';

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
  const { documentType } = args.object as { documentType?: unknown };
  const isType = Object.values(DocumentType).includes(
    documentType as DocumentType,
  );
  if (typeof value !== 'string' || !isType) return null;
  return documentNumberError(documentType as DocumentType, value);
}

export class CreateCustomerDto {
  @ApiProperty({ enum: DocumentType, enumName: 'DocumentType' })
  @IsEnum(DocumentType, {
    message: 'El tipo de documento es DNI, RUC, CE o PASSPORT',
  })
  documentType: DocumentType;

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
  documentNumber: string;

  @ApiProperty({ example: 'Juan Pérez Rojas', maxLength: 150 })
  @Transform(trim)
  @MaxLength(150, { message: 'El nombre tiene como máximo 150 caracteres' })
  @IsNotEmpty({ message: 'Ingresa el nombre o la razón social' })
  @IsString({ message: 'Ingresa el nombre o la razón social' })
  name: string;

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
  phone: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'juan@correo.pe',
  })
  @IsOptional()
  @TrimToNull()
  @MaxLength(254, { message: 'El correo es demasiado largo' })
  @IsEmail({}, { message: 'Ingresa un correo válido' })
  email?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 250 })
  @IsOptional()
  @TrimToNull()
  @MaxLength(250, { message: 'La dirección tiene como máximo 250 caracteres' })
  @IsString({ message: 'La dirección tiene que ser texto' })
  address?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @TrimToNull()
  @MaxLength(1000, { message: 'Las notas tienen como máximo 1000 caracteres' })
  @IsString({ message: 'Las notas tienen que ser texto' })
  notes?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean({ message: 'El estado tiene que ser verdadero o falso' })
  isActive?: boolean;
}
