import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { normalizeDocumentNumber } from '../../../../shared/document-number.js';
import { UserRole } from '../../../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateUserDto {
  @ApiProperty({ example: 'jquispe@autofix.local', maxLength: 254 })
  // El correo se guarda en minúsculas, igual que en el login: es con lo que se
  // inicia sesión, y «Juan@Taller.pe» y «juan@taller.pe» son la misma persona.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @MaxLength(254, { message: 'El correo es demasiado largo' })
  @IsEmail({}, { message: 'Ingresa un correo válido' })
  // class-validator evalúa de abajo hacia arriba y se detiene en el primer
  // error: el chequeo más básico va al final.
  @IsString({ message: 'Ingresa el correo' })
  email: string;

  @ApiProperty({
    example: '45678912',
    description: 'DNI: con él o con el correo inicia sesión',
  })
  // Como el de un cliente: sin espacios, puntos ni guiones.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeDocumentNumber(value) : value,
  )
  @Matches(/^\d{8}$/, { message: 'El DNI tiene 8 dígitos' })
  @IsString({ message: 'Ingresa el DNI' })
  documentNumber: string;

  @ApiProperty({ example: 'Juan Quispe Mamani', maxLength: 120 })
  @Transform(trim)
  @MaxLength(120, { message: 'El nombre tiene como máximo 120 caracteres' })
  @IsNotEmpty({ message: 'Ingresa el nombre' })
  @IsString({ message: 'Ingresa el nombre' })
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: '987654321' })
  @IsOptional()
  // Igual que el teléfono de un cliente: sin espacios, guiones ni paréntesis,
  // y vacío es «sin teléfono».
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s()-]/g, '') || null : value,
  )
  @Matches(/^\+?\d{6,15}$/, {
    message: 'El teléfono tiene de 6 a 15 dígitos y puede empezar con +',
  })
  @IsString({ message: 'El teléfono tiene que ser texto' })
  phone?: string | null;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  @IsEnum(UserRole, { message: 'El rol es ADMIN o MECHANIC' })
  role: UserRole;

  // Sin contraseña: la genera el sistema (temporal) y el usuario la cambia al
  // entrar. El administrador no conoce la contraseña de nadie.
}
