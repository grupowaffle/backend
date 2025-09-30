import { getDrizzleClient } from './src/config/db';
import { sql } from 'drizzle-orm';

async function resetDatabase() {
  console.log('🗑️  ATENÇÃO: Este script irá APAGAR TODOS OS DADOS do banco!\n');

  // Aguardar confirmação
  console.log('⏳ Iniciando em 3 segundos... (Ctrl+C para cancelar)\n');
  await new Promise(resolve => setTimeout(resolve, 3000));

  const env = {
    DATABASE_URL: process.env.DATABASE_URL,
  };

  try {
    const db = getDrizzleClient(env);

    console.log('📋 Listando todas as tabelas...');

    // Obter lista de todas as tabelas
    const tables = await db.execute(sql`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE 'sql_%'
      ORDER BY tablename;
    `);

    console.log(`\nEncontradas ${tables.rows.length} tabelas:`);
    tables.rows.forEach((row: any) => {
      console.log(`   - ${row.tablename}`);
    });

    console.log('\n🔥 Removendo todas as tabelas...\n');

    // Apagar cada tabela com CASCADE para lidar com dependências
    for (const row of tables.rows as any[]) {
      const tableName = row.tablename;
      console.log(`   Deletando tabela: ${tableName}...`);
      try {
        await db.execute(sql.raw(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`));
        console.log(`   ✅ ${tableName} deletada`);
      } catch (err) {
        console.log(`   ⚠️  Erro ao deletar ${tableName}: ${err}`);
      }
    }

    console.log('\n✅ Banco de dados limpo com sucesso!');
    console.log('\n📝 Próximos passos:');
    console.log('   1. npm run db:push - Para recriar as tabelas');
    console.log('   2. npm run seed:categories - Para popular categorias');
    console.log('   3. Outros seeds conforme necessário\n');

  } catch (error) {
    console.error('❌ Erro ao limpar banco:', error);
    process.exit(1);
  }
}

resetDatabase().catch(console.error);