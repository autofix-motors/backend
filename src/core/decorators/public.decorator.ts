import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca un endpoint como accesible sin sesión. Todo lo demás exige sesión por
 * defecto: un endpoint público se declara a propósito, no se olvida proteger.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
