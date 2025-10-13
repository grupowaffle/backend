import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';

// Usar a URL do banco de dados do ambiente
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não encontrada no ambiente');
  process.exit(1);
}

async function createNotificationSettingsTable() {
  try {
    console.log('🚀 Criando tabela notification_settings...');
    
    const sqlClient = neon(DATABASE_URL);
    const db = drizzle(sqlClient);
    
    // Criar a tabela
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notification_settings (
        id TEXT PRIMARY KEY,
        webhook_url TEXT NOT NULL,
        enabled BOOLEAN DEFAULT FALSE,
        notifications JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);
    
    // Criar índice
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_notification_settings_enabled 
      ON notification_settings(enabled)
    `);
    
    console.log('✅ Tabela notification_settings criada com sucesso!');
    
    // Verificar se foi criada
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM notification_settings
    `);
    
    console.log('📊 Registros na tabela:', result);
    
  } catch (error) {
    console.error('❌ Erro ao criar tabela:', error);
    process.exit(1);
  }
}

createNotificationSettingsTable();
