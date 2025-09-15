// import { createId } from '@paralleldrive/cuid2';

/**
 * Gera um ID único simples para desenvolvimento
 * 
 * @returns string - ID único
 */
export function generateId(): string {
  return 'id_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

/**
 * Gera um ID curto para desenvolvimento
 * 
 * @returns string - ID curto
 */
export function generateShortId(): string {
  return 'id_' + Math.random().toString(36).substr(2, 6);
}

/**
 * Gera um ID para URLs (slug-friendly)
 * 
 * @returns string - ID para URLs
 */
export function generateUrlId(): string {
  return 'url_' + Math.random().toString(36).substr(2, 8) + Date.now().toString(36);
}

/**
 * Valida se uma string é um CUID válido
 * 
 * @param id - String para validar
 * @returns boolean - true se for CUID válido
 * 
 * @example
 * const isValid = isValidCuid("clz8ixkqc0000v4s8r2h3w5j1"); // true
 */
export function isValidCuid(id: string): boolean {
  // CUID2 pattern: starts with 'c', followed by 24 characters
  const cuidPattern = /^c[a-z0-9]{24}$/;
  return cuidPattern.test(id);
}
