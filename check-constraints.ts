import { getDrizzleClient } from './src/config/db';
import { sql } from 'drizzle-orm';

async function checkConstraints() {
  console.log('🔍 Verificando constraints relacionadas a categorias...\n');

  const env = {
    DATABASE_URL: process.env.NEON_URL || process.env.DATABASE_URL,
  };

  try {
    const db = getDrizzleClient(env);

    // Check for foreign key constraints on categories table
    console.log('📋 1. Foreign Key Constraints relacionadas a categories:');
    const constraints = await db.execute(sql`
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule,
        rc.update_rule
      FROM
        information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints AS rc
          ON tc.constraint_name = rc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND (tc.table_name = 'categories' OR ccu.table_name = 'categories')
      ORDER BY tc.table_name, tc.constraint_name;
    `);

    if (constraints.rows.length > 0) {
      constraints.rows.forEach((row: any) => {
        console.log(`   - ${row.table_name}.${row.column_name} -> ${row.foreign_table_name}.${row.foreign_column_name}`);
        console.log(`     Delete: ${row.delete_rule}, Update: ${row.update_rule}`);
      });
    } else {
      console.log('   Nenhuma constraint encontrada.');
    }

    // Check articles that reference categories
    console.log('\n📰 2. Artigos que referenciam categorias:');
    const articlesWithCategories = await db.execute(sql`
      SELECT
        a.id,
        a.title,
        a."categoryId",
        c.name as category_name
      FROM articles a
      LEFT JOIN categories c ON a."categoryId" = c.id
      WHERE a."categoryId" IS NOT NULL
      LIMIT 10;
    `);

    console.log(`   Total de artigos com categoria: ${articlesWithCategories.rows.length}`);
    articlesWithCategories.rows.forEach((row: any) => {
      console.log(`   - ${row.title} (${row.category_name})`);
    });

    // Check self-referencing categories (parent-child)
    console.log('\n👨‍👩‍👧‍👦 3. Categorias com relacionamento pai-filho:');
    const hierarchicalCategories = await db.execute(sql`
      SELECT
        child.id as child_id,
        child.name as child_name,
        parent.id as parent_id,
        parent.name as parent_name
      FROM categories child
      LEFT JOIN categories parent ON child."parentId" = parent.id
      WHERE child."parentId" IS NOT NULL;
    `);

    if (hierarchicalCategories.rows.length > 0) {
      hierarchicalCategories.rows.forEach((row: any) => {
        console.log(`   - ${row.child_name} é filho de ${row.parent_name}`);
      });
    } else {
      console.log('   Nenhuma categoria com relacionamento pai-filho.');
    }

    // Check for unique constraints on categories
    console.log('\n🔒 4. Unique Constraints na tabela categories:');
    const uniqueConstraints = await db.execute(sql`
      SELECT
        tc.constraint_name,
        kcu.column_name
      FROM
        information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'UNIQUE'
        AND tc.table_name = 'categories'
      ORDER BY tc.constraint_name;
    `);

    uniqueConstraints.rows.forEach((row: any) => {
      console.log(`   - ${row.constraint_name}: ${row.column_name}`);
    });

    console.log('\n✅ Verificação de constraints concluída.');

  } catch (error) {
    console.error('❌ Erro ao verificar constraints:', error);
    process.exit(1);
  }
}

checkConstraints().catch(console.error);