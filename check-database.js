import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

async function checkDatabase(name, url) {
  console.log(`\n=== Verificando ${name} ===`);
  console.log(`URL: ${url.split('@')[1]}`); // Hide credentials
  
  try {
    const sql = neon(url);
    
    // Lista todas as tabelas
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    
    console.log(`\nTabelas encontradas (${tables.length}):`);
    tables.forEach(t => console.log(`  - ${t.table_name}`));
    
    // Verifica especificamente as tabelas do CMS
    const cmsTablesCheck = await sql`
      SELECT 
        table_name,
        (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
      AND table_name IN (
        'articles', 'categories', 'authors', 'media',
        'beehiiv_publications', 'beehiiv_posts', 'beehiiv_sync_logs',
        'editorial_workflow', 'featured_content', 'notifications'
      )
      ORDER BY table_name;
    `;
    
    if (cmsTablesCheck.length > 0) {
      console.log(`\nTabelas do CMS encontradas:`);
      cmsTablesCheck.forEach(t => console.log(`  - ${t.table_name} (${t.column_count} colunas)`));
    } else {
      console.log(`\n❌ Nenhuma tabela do CMS encontrada neste banco`);
    }
    
    // Conta registros nas tabelas existentes
    const recordCounts = await sql`
      SELECT 
        'users' as table_name, COUNT(*) as count FROM users
      UNION ALL
      SELECT 'subscribers', COUNT(*) FROM subscribers
      UNION ALL
      SELECT 'tickets', COUNT(*) FROM tickets
      UNION ALL
      SELECT 'acquisitions', COUNT(*) FROM acquisitions
      UNION ALL
      SELECT 'url_tracking', COUNT(*) FROM url_tracking
    `;
    
    console.log(`\nContagem de registros:`);
    recordCounts.forEach(r => console.log(`  - ${r.table_name}: ${r.count} registros`));
    
  } catch (error) {
    console.error(`❌ Erro ao conectar: ${error.message}`);
  }
}

// Testa os dois bancos
async function main() {
  console.log('🔍 Verificando bancos de dados Neon...\n');
  
  await checkDatabase('DATABASE_URL (ep-icy-bird)', process.env.DATABASE_URL);
  await checkDatabase('NEON_PROD (ep-mute-grass)', process.env.NEON_PROD);
  
  console.log('\n✅ Verificação concluída!');
}

main().catch(console.error);