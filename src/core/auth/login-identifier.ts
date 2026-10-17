import { normalizeDocumentNumber } from '../../shared/document-number.js';

/**
 * Con qué se inicia sesión: un correo o un número de documento, en el mismo
 * campo. Con «@» es un correo (en minúsculas, como se guarda); si no, un
 * documento sin espacios, puntos ni guiones (como se guarda). Así «Juan@Correo.pe»
 * y «45.678.912» encuentran lo mismo que se registró.
 */
export interface LoginIdentifier {
  kind: 'email' | 'document';
  value: string;
}

export function normalizeLoginIdentifier(raw: string): LoginIdentifier {
  const trimmed = raw.trim();
  if (trimmed.includes('@')) {
    return { kind: 'email', value: trimmed.toLowerCase() };
  }
  return { kind: 'document', value: normalizeDocumentNumber(trimmed) };
}
