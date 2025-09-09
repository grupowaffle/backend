import { createId } from '@paralleldrive/cuid2';

/**
 * Gera um ID único usando CUID2
 * Mais curto que UUID, URL-safe e collision-resistant
 * 
 * @returns string - ID único (25 caracteres)
 * 
 * @example
 * const id = generateId(); // "clz8ixkqc0000v4s8r2h3w5j1"
 */
export function generateId(): string {
  return createId();
}

/**
 * Gera um ID curto usando CUID2
 * Versão mais curta para casos específicos
 * 
 * @returns string - ID curto (10 caracteres)
 * 
 * @example
 * const shortId = generateShortId(); // "clz8ixkqc0"
 */
export function generateShortId(): string {
  return createId().slice(0, 10);
}

/**
 * Gera um ID para URLs (slug-friendly)
 * Remove caracteres especiais e mantém apenas alfanuméricos
 * 
 * @returns string - ID para URLs
 * 
 * @example
 * const urlId = generateUrlId(); // "clz8ixkqc0000v4s8r2h3w5j1"
 */
export function generateUrlId(): string {
  return createId();
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
