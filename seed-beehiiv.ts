import { neon } from '@neondatabase/serverless';
import 'dotenv/config';
import { generateId } from './src/lib/cuid.js';

// BeehIV publications from .env
const BEEHIIV_PUBLICATIONS = JSON.parse(process.env.BEEHIIV_PUBLICATIONS || '{}');

async function seedBeehiivPublications() {
  const sql = neon(process.env.DATABASE_URL!);
  
  console.log('🌱 Povoando banco com publicações BeehIV...\n');
  
  try {
    // Check existing publications
    const existing = await sql`SELECT "beehiivId" FROM beehiiv_publications`;
    const existingIds = new Set(existing.map((p: any) => p.beehiivId));
    
    let created = 0;
    let skipped = 0;
    
    for (const [slug, beehiivId] of Object.entries(BEEHIIV_PUBLICATIONS) as [string, string][]) {
      if (existingIds.has(beehiivId)) {
        console.log(`⏭️  Pulando ${slug} - já existe`);
        skipped++;
        continue;
      }
      
      // Create publication record
      await sql`
        INSERT INTO beehiiv_publications (
          id, "beehiivId", name, slug, "apiToken", "isActive", "createdAt"
        ) VALUES (
          ${generateId()},
          ${beehiivId},
          ${slug.charAt(0).toUpperCase() + slug.slice(1)},
          ${slug},
          null,
          true,
          NOW()
        )
      `;
      
      console.log(`✅ Criado: ${slug} (${beehiivId})`);
      created++;
    }
    
    console.log(`\n📊 Resumo:`);
    console.log(`   Criadas: ${created}`);
    console.log(`   Existentes: ${skipped}`);
    console.log(`   Total: ${Object.keys(BEEHIIV_PUBLICATIONS).length}`);
    
    if (created > 0) {
      console.log('\n⚠️  IMPORTANTE: As publicações foram criadas SEM API tokens.');
      console.log('   Configure os tokens via: PUT /api/cms/beehiiv/publications/{id}');
    }
    
    console.log('\n✨ Seed de publicações concluído com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao povoar publicações:', error);
    throw error;
  }
}

async function seedBasicCategories() {
  const sql = neon(process.env.DATABASE_URL!);
  
  console.log('\n🏷️  Criando categorias básicas...\n');
  
  const categories = [
    { name: 'Geral', slug: 'geral', color: '#6B7280' },
    { name: 'Política', slug: 'politica', color: '#DC2626' },
    { name: 'Internacional', slug: 'internacional', color: '#2563EB' },
    { name: 'Economia', slug: 'economia', color: '#059669' },
    { name: 'Tecnologia', slug: 'tecnologia', color: '#7C3AED' },
    { name: 'Entretenimento', slug: 'entretenimento', color: '#EA580C' },
  ];
  
  try {
    const existing = await sql`SELECT slug FROM categories`;
    const existingSlugs = new Set(existing.map((c: any) => c.slug));
    
    let created = 0;
    
    for (const category of categories) {
      if (existingSlugs.has(category.slug)) {
        console.log(`⏭️  Categoria ${category.name} já existe`);
        continue;
      }
      
      await sql`
        INSERT INTO categories (
          id, name, slug, color, "order", "isActive", "createdAt", "updatedAt"
        ) VALUES (
          ${generateId()},
          ${category.name},
          ${category.slug},
          ${category.color},
          ${categories.indexOf(category)},
          true,
          NOW(),
          NOW()
        )
      `;
      
      console.log(`✅ Categoria criada: ${category.name}`);
      created++;
    }
    
    console.log(`\n📊 Categorias criadas: ${created}`);
    
  } catch (error) {
    console.error('❌ Erro ao criar categorias:', error);
    throw error;
  }
}

// Run seeds
async function runSeeds() {
  try {
    await seedBeehiivPublications();
    await seedBasicCategories();
    console.log('\n🎉 Seed completo realizado com sucesso!');
  } catch (error) {
    console.error('❌ Erro durante seed:', error);
    process.exit(1);
  }
}

runSeeds();