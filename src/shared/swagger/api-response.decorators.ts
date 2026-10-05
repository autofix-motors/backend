import { applyDecorators, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { BaseResponseDto } from '../dto/base-response.dto.js';
import { PaginationMeta } from '../pagination.js';

interface Options {
  status?: number;
  description?: string;
}

// Swagger no entiende genéricos: `BaseResponseDto<Customer>` se documenta
// combinando el envoltorio con el modelo de `data` (allOf). Sin esto,
// `api.gen.ts` del frontend tiparía `data` como desconocido.

/**
 * Respuesta con un resultado en `data`, o `null` si `model` es null. Con
 * `isArray`, `data` es una lista sin paginar (para listas cortas, como las
 * opciones de un filtro).
 */
export function ApiBaseResponse(
  model: Type | null,
  options: Options & { isArray?: boolean } = {},
) {
  const ref = model && { $ref: getSchemaPath(model) };
  const data = !ref
    ? { type: 'object', nullable: true, example: null }
    : options.isArray
      ? { type: 'array', items: ref }
      : ref;
  return applyDecorators(
    ApiExtraModels(BaseResponseDto, ...(model ? [model] : [])),
    ApiResponse({
      status: options.status ?? 200,
      description: options.description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(BaseResponseDto) },
          { properties: { data }, required: ['data'] },
        ],
      },
    }),
  );
}

/** Respuesta de un listado: la página en `data` y la paginación en `meta`. */
export function ApiPaginatedResponse(model: Type, options: Options = {}) {
  return applyDecorators(
    ApiExtraModels(BaseResponseDto, PaginationMeta, model),
    ApiResponse({
      status: options.status ?? 200,
      description: options.description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(BaseResponseDto) },
          {
            properties: {
              data: { type: 'array', items: { $ref: getSchemaPath(model) } },
              meta: { $ref: getSchemaPath(PaginationMeta) },
            },
            required: ['data', 'meta'],
          },
        ],
      },
    }),
  );
}
