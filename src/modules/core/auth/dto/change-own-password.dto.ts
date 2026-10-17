import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Cambiar la propia contraseña, del personal o de un cliente. Se pide la
 * actual aunque haya sesión: una sesión abierta en una computadora prestada no
 * alcanza para quedarse con la cuenta.
 */
export class ChangeOwnPasswordDto {
  @ApiProperty({ format: 'password' })
  @MaxLength(200, { message: 'La contraseña es demasiado larga' })
  @MinLength(1, { message: 'Ingresa tu contraseña actual' })
  @IsString({ message: 'Ingresa tu contraseña actual' })
  currentPassword: string;

  @ApiProperty({ format: 'password', minLength: 8, maxLength: 200 })
  // El mínimo es el mismo del administrador sembrado (ADMIN_PASSWORD).
  @MaxLength(200, { message: 'La contraseña es demasiado larga' })
  @MinLength(8, { message: 'La contraseña nueva tiene al menos 8 caracteres' })
  @IsString({ message: 'Ingresa la contraseña nueva' })
  newPassword: string;
}
