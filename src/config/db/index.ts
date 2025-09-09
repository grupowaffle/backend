import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';


// Interface para o ambiente Cloudflare Workers
export interface DatabaseEnv {
  DATABASE_URL?: string;
  NEON_URL?: string;
}

// Cache global para o cliente Drizzle (otimização para Workers)
declare global {
  var __drizzle: ReturnType<typeof drizzle> | undefined;
}

export function createDrizzleClient(env: DatabaseEnv) {
  // Usar NEON_URL se disponível, senão usar DATABASE_URL
  const databaseUrl = env.NEON_URL || env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL ou NEON_URL deve estar configurada');
  }

  // Reutilizar cliente existente ou criar novo
  if (!globalThis.__drizzle) {
    const sql = neon(databaseUrl);
    globalThis.__drizzle = drizzle(sql, { schema });
    
    console.log('Drizzle client created for Neon');
  }
  
  return globalThis.__drizzle;
}

export function getDrizzleClient(env: DatabaseEnv) {
  return createDrizzleClient(env);
}

// Helper para verificar qual banco está sendo usado
export function getDatabaseType(env: DatabaseEnv): 'neon' | 'fallback' {
  return env.NEON_URL ? 'neon' : 'fallback';
}

// Re-export schema para uso fácil
export { schema };
export * from './schema';