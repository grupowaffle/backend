import { getDrizzleClient } from './src/config/db';
import { sql } from 'drizzle-orm';

async function checkTables() {
  const env = {
    DATABASE_URL: process.env.DATABASE_URL,
  };

  const db = getDrizzleClient(env);

  console.log('📋 Verificando tabelas existentes...\n');

  const tables = await db.execute(sql`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename NOT LIKE 'pg_%'
    AND tablename NOT LIKE 'sql_%'
    ORDER BY tablename;
  `);

  if (tables.rows.length === 0) {
    console.log('✅ Banco está vazio! Pronto para criar tabelas.');
  } else {
    console.log(`⚠️  Encontradas ${tables.rows.length} tabelas:`);
    tables.rows.forEach((row: any) => {
      console.log(`   - ${row.tablename}`);
    });
  }
}

checkTables().catch(console.error);