import { SetMetadata } from '@nestjs/common';

export const CUSTOMER_ONLY_KEY = 'customerOnly';

/**
 * El endpoint es del portal del cliente: solo entra una sesión de cliente, y
 * el personal recibe 403. Es la única forma de abrirle un endpoint a un
 * cliente además de `@AnySession()`: sin decorador, el RolesGuard lo rechaza.
 */
export const CustomerOnly = () => SetMetadata(CUSTOMER_ONLY_KEY, true);
