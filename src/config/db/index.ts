import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import * as schema from './schema';


// Interface para o ambiente Cloudflare Workers
export interface DatabaseEnv {
  DATABASE_URL?: string;
  NEON_URL?: string;
}

// CRÍTICO: Cache global para o cliente Drizzle (evita múltiplas conexões)
declare global {
  var __drizzle: ReturnType<typeof drizzle> | undefined;
  var __drizzle_created: boolean | undefined;
}

export function createDrizzleClient(env: DatabaseEnv) {
  try {
    // Usar NEON_URL se disponível, senão usar DATABASE_URL
    const databaseUrl = env.NEON_URL || env.DATABASE_URL;
    
    if (!databaseUrl) {
      throw new Error('DATABASE_URL ou NEON_URL deve estar configurada');
    }

    // CRÍTICO: Verificar se é string de pooler para Workers
    if (!databaseUrl.includes('pooler')) {
      console.warn('⚠️  CRÍTICO: Usando endpoint direto em vez de pooler. Workers precisam de pooler!');
    }

    // CRÍTICO: Reutilizar cliente existente ou criar novo (evita múltiplas conexões)
    if (!globalThis.__drizzle || !globalThis.__drizzle_created) {
      const sql = neon(databaseUrl, {
        arrayMode: false,
        fullResults: false,
        fetchConnectionCache: true, // CRÍTICO para Workers
      });
      
      globalThis.__drizzle = drizzle(sql, { 
        schema,
        logger: process.env.NODE_ENV === 'development'
      });
      
      globalThis.__drizzle_created = true;
      console.log('✅ Drizzle client created for Neon with pooling (globalThis cached)');
    } else {
      console.log('♻️  Reusing existing Drizzle client (globalThis)');
    }
    
    return globalThis.__drizzle;
  } catch (error) {
    console.error('❌ CRÍTICO: Failed to create Drizzle client:', error);
    throw new Error(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function getDrizzleClient(env: DatabaseEnv) {
  return createDrizzleClient(env);
}

// Helper para verificar qual banco está sendo usado
export function getDatabaseType(env: DatabaseEnv): 'neon' | 'fallback' {
  return env.NEON_URL ? 'neon' : 'fallback';
}

// CRÍTICO: Health check para produção
export async function healthCheck(env: DatabaseEnv): Promise<{ 
  status: 'healthy' | 'unhealthy'; 
  error?: string; 
  connectionType: string;
}> {
  try {
    const db = createDrizzleClient(env);
    await db.execute(sql`SELECT 1 as health_check`);
    
    return {
      status: 'healthy',
      connectionType: getDatabaseType(env)
    };
  } catch (error) {
    console.error('❌ CRÍTICO: Database health check failed:', error);
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      connectionType: getDatabaseType(env)
    };
  }
}

// Re-export schema para uso fácil
export { schema };
export * from './schema';