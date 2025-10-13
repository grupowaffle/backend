// Script para adicionar campo newsletters na tabela calendar_events
// Executar com: npx tsx run-newsletters-migration.ts

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';

async function runMigration() {
  try {
    console.log('🚀 Iniciando migração para adicionar campo newsletters...');
    
    // Usar a URL do banco de dados do ambiente
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      throw new Error('❌ DATABASE_URL não encontrada no ambiente');
    }
    
    console.log('📡 Conectando ao banco de dados...');
    const sqlClient = neon(databaseUrl);
    const db = drizzle(sqlClient);
    
    // Verificar se a coluna já existe
    console.log('🔍 Verificando se a coluna newsletters já existe...');
    const checkColumn = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'calendar_events' 
      AND column_name = 'newsletters'
    `);
    
    if (checkColumn.length > 0) {
      console.log('✅ Coluna newsletters já existe na tabela calendar_events');
      return;
    }
    
    // Adicionar coluna newsletters
    console.log('➕ Adicionando coluna newsletters...');
    await db.execute(sql`
      ALTER TABLE calendar_events 
      ADD COLUMN newsletters TEXT
    `);
    
    // Adicionar comentário na coluna
    await db.execute(sql`
      COMMENT ON COLUMN calendar_events.newsletters IS 'Array JSON de IDs de newsletters associadas ao evento'
    `);
    
    console.log('✅ Coluna newsletters adicionada com sucesso!');
    
    // Verificar se a migração foi aplicada
    console.log('🔍 Verificando se a migração foi aplicada...');
    const verifyColumn = await db.execute(sql`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'calendar_events' 
      AND column_name = 'newsletters'
    `);
    
    console.log('📊 Resultado da verificação:', verifyColumn);
    
    console.log('🎉 Migração concluída com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro durante a migração:', error);
    throw error;
  }
}

// Executar migração se chamado diretamente
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('✅ Migração executada com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro na migração:', error);
      process.exit(1);
    });
}

export { runMigration };
