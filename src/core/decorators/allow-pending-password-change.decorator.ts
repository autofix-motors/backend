import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD_CHANGE_KEY = 'allowPendingPasswordChange';

/**
 * El endpoint se puede usar con la contraseña temporal sin cambiar: solo ver
 * la sesión y cambiar la contraseña. Todo lo demás responde 403 hasta que la
 * cambie (PasswordChangeGuard).
 */
export const AllowPendingPasswordChange = () =>
  SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, true);
