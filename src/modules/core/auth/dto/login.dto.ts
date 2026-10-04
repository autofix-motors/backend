import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@taller.local' })
  // El correo se guarda en minúsculas: se normaliza antes de validar para que
  // «Admin@Taller.local» encuentre al mismo usuario.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Ingresa un correo válido' })
  email: string;

  @ApiProperty({ format: 'password' })
  @IsString({ message: 'Ingresa la contraseña' })
  @MinLength(1, { message: 'Ingresa la contraseña' })
  // Tope para que nadie mande una contraseña de megabytes: argon2 la procesaría
  // entera y es caro a propósito.
  @MaxLength(200, { message: 'La contraseña es demasiado larga' })
  password: string;
}
