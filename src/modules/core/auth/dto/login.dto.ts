import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Para los dos logins, el del personal y el del cliente. El identificador es
 * el número de documento o el correo, en el mismo campo: el service decide
 * cuál es (`normalizeLoginIdentifier`).
 */
export class LoginDto {
  @ApiProperty({
    example: '45678912',
    description: 'Número de documento o correo',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(254, { message: 'El documento o correo es demasiado largo' })
  @IsNotEmpty({ message: 'Ingresa tu documento o correo' })
  // class-validator evalúa de abajo hacia arriba y se detiene en el primer
  // error: el chequeo más básico va al final.
  @IsString({ message: 'Ingresa tu documento o correo' })
  identifier: string;

  @ApiProperty({ format: 'password' })
  // Tope para que nadie mande una contraseña de megabytes: argon2 la procesaría
  // entera y es caro a propósito.
  @MaxLength(200, { message: 'La contraseña es demasiado larga' })
  @MinLength(1, { message: 'Ingresa la contraseña' })
  @IsString({ message: 'Ingresa la contraseña' })
  password: string;
}
