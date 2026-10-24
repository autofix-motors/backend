import { DocumentType } from '../generated/prisma/enums.js';

/**
 * Deja el número como se guarda: en mayúsculas y sin espacios, guiones ni
 * puntos. «20-123.456.789-1» y «201234567891» son el mismo documento, y es lo
 * que se compara para no registrar dos veces al mismo cliente.
 */
export function normalizeDocumentNumber(value: string): string {
  return value.replace(/[\s.-]/g, '').toUpperCase();
}

// Lo que exige cada tipo, ya normalizado. El RUC empieza en 10 (persona
// natural), 15, 16, 17 (otros contribuyentes) o 20 (empresa).
const RULES: Record<DocumentType, { pattern: RegExp; message: string }> = {
  [DocumentType.DNI]: {
    pattern: /^\d{8}$/,
    message: 'El DNI tiene 8 dígitos',
  },
  [DocumentType.RUC]: {
    pattern: /^(10|15|16|17|20)\d{9}$/,
    message: 'El RUC tiene 11 dígitos y empieza en 10, 15, 16, 17 o 20',
  },
  [DocumentType.CE]: {
    pattern: /^[A-Z0-9]{6,12}$/,
    message: 'El carné de extranjería tiene de 6 a 12 letras o dígitos',
  },
  [DocumentType.PASSPORT]: {
    pattern: /^[A-Z0-9]{6,12}$/,
    message: 'El pasaporte tiene de 6 a 12 letras o dígitos',
  },
};

/** El mensaje de error si el número no corresponde al tipo, o null. */
export function documentNumberError(
  type: DocumentType,
  value: string,
): string | null {
  const rule = RULES[type];
  return rule.pattern.test(value) ? null : rule.message;
}
