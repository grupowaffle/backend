import { getDrizzleClient } from './src/config/db';
import { sql } from 'drizzle-orm';

async function createNotificationSettingsTable() {
  try {
    console.log('🚀 Iniciando migração da tabela notification_settings...');
    
    // Simular env para desenvolvimento local
    const env = {
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://localhost:5432/portal'
    };
    
    const db = getDrizzleClient(env as any);
    
    // Executar SQL para criar a tabela
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
    
    // Criar índice para melhor performance
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_notification_settings_enabled 
      ON notification_settings(enabled)
    `);
    
    console.log('✅ Tabela notification_settings criada com sucesso!');
    console.log('📊 Verificando se a tabela foi criada...');
    
    // Verificar se a tabela foi criada
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM notification_settings
    `);
    
    console.log('📈 Registros na tabela:', result);
    
  } catch (error) {
    console.error('❌ Erro ao criar tabela notification_settings:', error);
    process.exit(1);
  }
}

// Executar migração
createNotificationSettingsTable();
