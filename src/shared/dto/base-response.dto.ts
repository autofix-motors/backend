import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * El formato de TODA respuesta de la API, de éxito o de error. Así el frontend
 * lee un solo formato: `success` dice qué pasó, `message` es el texto en
 * español que se le muestra al usuario, y `data` trae el resultado.
 *
 * - `data`: el resultado; `null` en errores y en operaciones sin resultado
 *   (cerrar sesión, borrar).
 * - `error`: el detalle de un error, cuando hay más de un motivo (la lista de
 *   campos inválidos de un formulario).
 * - `meta`: datos sobre `data`, como la paginación de un listado.
 *
 * Los controladores devuelven `BaseResponseDto.success(...)`; los errores los
 * arma el filtro global (`core/filters/http-exception.filter.ts`).
 */
export class BaseResponseDto<T> {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ example: 'Operación realizada' })
  message: string;

  data: T | null;

  @ApiPropertyOptional()
  error?: unknown;

  @ApiProperty({ example: 200 })
  statusCode: number;

  meta?: Record<string, unknown>;

  constructor(
    success: boolean,
    message: string,
    data: T | null,
    statusCode: number,
    error?: unknown,
    meta?: Record<string, unknown>,
  ) {
    this.success = success;
    this.message = message;
    this.data = data;
    this.statusCode = statusCode;
    this.error = error;
    this.meta = meta;
  }

  static success<T>(
    data: T,
    message: string,
    statusCode = 200,
    meta?: Record<string, unknown>,
  ): BaseResponseDto<T> {
    return new BaseResponseDto<T>(
      true,
      message,
      data,
      statusCode,
      undefined,
      meta,
    );
  }

  static error(
    message: string,
    statusCode: number,
    error?: unknown,
  ): BaseResponseDto<null> {
    return new BaseResponseDto<null>(false, message, null, statusCode, error);
  }
}
