import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import * as schema from './schema';
import type { Env } from '../types/common';

// Cache global para a conexão
declare global {
  var __neonDb: ReturnType<typeof drizzle> | undefined;
}

export function createDatabaseConnection(databaseUrl: string) {
  const pool = new Pool({ 
    connectionString: databaseUrl,
    // Connection pool settings
    max: 10, // Maximum number of connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  return drizzle(pool, { schema });
}

/**
 * Get database connection using Neon PostgreSQL
 */
export function getDb(env?: Env) {
  // Se já temos uma conexão em cache, reutilizá-la
  if (globalThis.__neonDb) {
    return globalThis.__neonDb;
  }

  const databaseUrl = env?.DATABASE_URL || env?.NEON_URL || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be configured for Neon PostgreSQL');
  }

  console.log('🐘 Creating Neon PostgreSQL connection...');
  
  const connection = createDatabaseConnection(databaseUrl);
  
  // Cache a conexão globalmente
  globalThis.__neonDb = connection;
  
  console.log('✅ Neon PostgreSQL connected successfully');
  
  return connection;
}

/**
 * Health check for Neon database
 */
export async function healthCheckDb(env?: Env): Promise<boolean> {
  try {
    const db = getDb(env);
    const result = await db.execute({ sql: 'SELECT 1 as health', args: [] });
    return Boolean(result);
  } catch (error) {
    console.error('❌ Neon database health check failed:', error);
    return false;
  }
}

// Export schema for easy access
export * from './schema';