// Script para inserir dados na tabela newsletters
// Executar com: npx tsx insert-newsletters-data.ts

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';

async function insertNewslettersData() {
  try {
    console.log('🚀 Inserindo dados na tabela newsletters...');
    
    // Usar a URL do banco de dados do ambiente
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      throw new Error('❌ DATABASE_URL não encontrada no ambiente');
    }
    
    console.log('📡 Conectando ao banco de dados...');
    const sqlClient = neon(databaseUrl);
    const db = drizzle(sqlClient);
    
    // Inserir newsletters padrão
    console.log('📝 Inserindo newsletters padrão...');
    const newsletters = [
      { id: 'pub_98577126-2994-4111-bc86-f60974108b94', name: 'The Bizness', description: 'Business insights and market trends' },
      { id: 'pub_ce78b549-5923-439b-be24-3f24c454bc12', name: 'The News', description: 'Latest news and current events' },
      { id: 'pub_e6f2edcf-0484-47ad-b6f2-89a866ccadc8', name: 'The Stories', description: 'Compelling stories and narratives' },
      { id: 'pub_b0f0dc48-5946-40a5-b2b6-b245a1a0e680', name: 'The Jobs', description: 'Career opportunities and job market insights' },
      { id: 'pub_72a981c0-3a09-4a7c-b374-dbea5b69925c', name: 'The Champs', description: 'Champions and success stories' },
      { id: 'pub_89324c54-1b5f-4200-85e7-e199d56c76e3', name: 'Rising', description: 'Emerging trends and rising stars' },
      { id: 'pub_3f18517c-9a0b-487e-b1c3-804c71fa6285', name: 'GoGet', description: 'Productivity and achievement tips' },
      { id: 'pub_f11d861b-9b39-428b-a381-af3f07ef96c9', name: 'Health Times', description: 'Health and wellness insights' },
      { id: 'pub_87b5253f-5fac-42d9-bb03-d100f7d434aa', name: 'Dollar Bill', description: 'Financial advice and money management' },
      { id: 'pub_f41c4c52-beb8-4cc0-b8c0-02bb6ac2353c', name: 'Trend Report', description: 'Market trends and analysis' }
    ];
    
    for (const newsletter of newsletters) {
      try {
        await db.execute(sql`
          INSERT INTO newsletters (id, name, description, is_active) 
          VALUES (${newsletter.id}, ${newsletter.name}, ${newsletter.description}, TRUE)
          ON CONFLICT (id) DO NOTHING
        `);
        console.log(`✅ Newsletter inserida: ${newsletter.name}`);
      } catch (error) {
        console.log(`⚠️ Newsletter já existe: ${newsletter.name}`);
      }
    }
    
    console.log('✅ Dados inseridos com sucesso!');
    
    // Verificar se os dados foram inseridos
    console.log('🔍 Verificando dados inseridos...');
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM newsletters WHERE is_active = TRUE
    `);
    
    console.log('📊 Total de newsletters ativas:', result[0]?.count);
    
    // Listar todas as newsletters
    const allNewsletters = await db.execute(sql`
      SELECT id, name, description FROM newsletters WHERE is_active = TRUE ORDER BY name
    `);
    
    console.log('📋 Newsletters disponíveis:');
    if (Array.isArray(allNewsletters)) {
      allNewsletters.forEach((nl: any) => {
        console.log(`  - ${nl.name} (${nl.id})`);
      });
    } else {
      console.log('  - Dados não retornados como array');
    }
    
    console.log('🎉 Inserção de newsletters concluída com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro durante a inserção:', error);
    throw error;
  }
}

// Executar inserção se chamado diretamente
if (require.main === module) {
  insertNewslettersData()
    .then(() => {
      console.log('✅ Inserção de newsletters executada com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro na inserção de newsletters:', error);
      process.exit(1);
    });
}

export { insertNewslettersData };
