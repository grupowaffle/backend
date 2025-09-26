import { getDrizzleClient } from './src/config/db';
import { CategoryRepository } from './src/repositories';
import { generateId } from './src/lib/cuid';

const CATEGORIES = [
  { name: 'Internacional', slug: 'internacional', description: 'Notícias internacionais', icon: '🌍', color: '#3B82F6' },
  { name: 'Brasil', slug: 'brasil', description: 'Notícias do Brasil', icon: '🇧🇷', color: '#16A34A' },
  { name: 'Tecnologia', slug: 'tecnologia', description: 'Artigos sobre tecnologia e inovação', icon: '💻', color: '#8B5CF6' },
  { name: 'Economia', slug: 'economia', description: 'Notícias de economia e mercado', icon: '💰', color: '#F59E0B' },
  { name: 'Entretenimento', slug: 'entretenimento', description: 'Cultura e entretenimento', icon: '🎬', color: '#EC4899' },
  { name: 'Negócios', slug: 'negocios', description: 'Mundo dos negócios', icon: '💼', color: '#14B8A6' },
  { name: 'Esportes', slug: 'esportes', description: 'Notícias esportivas', icon: '⚽', color: '#EF4444' },
  { name: 'Saúde', slug: 'saude', description: 'Saúde e bem-estar', icon: '🏥', color: '#10B981' },
  { name: 'Cultura', slug: 'cultura', description: 'Arte e cultura', icon: '🎭', color: '#A855F7' },
  { name: 'Patrocinado', slug: 'patrocinado', description: 'Conteúdo patrocinado', icon: '📢', color: '#F97316' },
  { name: 'Geral', slug: 'geral', description: 'Notícias gerais', icon: '📰', color: '#6B7280' },
];

async function seedCategories() {
  console.log('🌱 Iniciando seed de categorias...\n');

  const env = {
    DATABASE_URL: process.env.DATABASE_URL,
  };

  const db = getDrizzleClient(env);
  const categoryRepo = new CategoryRepository(db);

  // Get existing categories
  const existing = await categoryRepo.list();
  const existingSlugs = new Set(existing.map(c => c.slug));

  console.log(`📋 Categorias existentes: ${existing.length}`);
  existing.forEach(cat => {
    console.log(`   - ${cat.name} (${cat.slug})`);
  });

  console.log('\n🔄 Criando categorias faltantes...\n');

  for (const category of CATEGORIES) {
    if (existingSlugs.has(category.slug)) {
      console.log(`⏭️  ${category.name} (${category.slug}) - já existe`);
      continue;
    }

    try {
      const created = await categoryRepo.create({
        id: generateId(),
        name: category.name,
        slug: category.slug,
        description: category.description,
        icon: category.icon,
        color: category.color,
        isActive: true,
        featuredOnHomepage: false,
        order: 0,
      });

      console.log(`✅ ${category.name} (${category.slug}) - criada com ID: ${created.id}`);
    } catch (error) {
      console.error(`❌ Erro ao criar ${category.name}:`, error);
    }
  }

  // Show final list
  const final = await categoryRepo.list();
  console.log(`\n✅ Total de categorias: ${final.length}`);
}

seedCategories()
  .then(() => {
    console.log('\n✅ Seed concluído!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Erro no seed:', err);
    process.exit(1);
  });