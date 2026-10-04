import { Transform } from 'class-transformer';

/**
 * Para los campos de texto opcionales: recorta los espacios y convierte el texto
 * vacío en `null`. Un formulario manda `""` cuando el usuario borra un campo, y
 * eso tiene que dejar la columna vacía (`null`), no guardar una cadena vacía que
 * después se muestra como un dato.
 *
 * Va antes de los validadores; con `@IsOptional()`, el `null` resultante no se
 * valida.
 */
export const TrimToNull = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  );
