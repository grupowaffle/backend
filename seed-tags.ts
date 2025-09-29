import { getDrizzleClient } from './src/config/db';
import { TagRepository } from './src/repositories';
import { generateId } from './src/lib/cuid';

const TAGS = [
  { name: 'Política', slug: 'politica', description: 'Política nacional e internacional', color: '#DC2626' },
  { name: 'Economia', slug: 'economia', description: 'Economia e finanças', color: '#F59E0B' },
  { name: 'Esportes', slug: 'esportes', description: 'Esportes em geral', color: '#10B981' },
  { name: 'Tecnologia', slug: 'tecnologia', description: 'Tecnologia e inovação', color: '#3B82F6' },
  { name: 'Saúde', slug: 'saude', description: 'Saúde e bem-estar', color: '#059669' },
  { name: 'Educação', slug: 'educacao', description: 'Educação e ensino', color: '#7C3AED' },
  { name: 'Cultura', slug: 'cultura', description: 'Cultura, arte e entretenimento', color: '#EC4899' },
  { name: 'Internacional', slug: 'internacional', description: 'Notícias internacionais', color: '#6366F1' },
  { name: 'Local', slug: 'local', description: 'Notícias locais e regionais', color: '#84CC16' },
  { name: 'Entretenimento', slug: 'entretenimento', description: 'Entretenimento e celebridades', color: '#F97316' },
  { name: 'Negócios', slug: 'negocios', description: 'Mundo dos negócios', color: '#0891B2' },
  { name: 'Ciência', slug: 'ciencia', description: 'Ciência e pesquisa', color: '#7C2D12' },
  { name: 'Meio Ambiente', slug: 'meio-ambiente', description: 'Meio ambiente e sustentabilidade', color: '#16A34A' },
  { name: 'Justiça', slug: 'justica', description: 'Justiça e direito', color: '#1F2937' },
  { name: 'Social', slug: 'social', description: 'Questões sociais', color: '#BE185D' },
  { name: 'Turismo', slug: 'turismo', description: 'Turismo e viagens', color: '#0D9488' },
  { name: 'Gastronomia', slug: 'gastronomia', description: 'Gastronomia e culinária', color: '#EA580C' },
  { name: 'Moda', slug: 'moda', description: 'Moda e estilo', color: '#A855F7' },
  { name: 'Automóveis', slug: 'automoveis', description: 'Automóveis e transporte', color: '#374151' },
  { name: 'Imóveis', slug: 'imoveis', description: 'Mercado imobiliário', color: '#92400E' },
];

async function seedTags() {
  console.log('🏷️  Iniciando seed de tags...\n');

  const env = {
    DATABASE_URL: process.env.DATABASE_URL,
  };

  const db = getDrizzleClient(env);
  const tagRepo = new TagRepository(db);

  // Get existing tags using listActive
  const existing = await tagRepo.listActive();
  const existingSlugs = new Set(existing.map(t => t.slug));

  console.log(`📋 Tags existentes: ${existing.length}`);
  existing.forEach(tag => {
    console.log(`   - ${tag.name} (${tag.slug})`);
  });

  console.log('\n🔄 Criando tags faltantes...\n');

  for (const tag of TAGS) {
    if (existingSlugs.has(tag.slug)) {
      console.log(`⏭️  ${tag.name} (${tag.slug}) - já existe`);
      continue;
    }

    try {
      const created = await tagRepo.create({
        id: generateId(),
        name: tag.name,
        slug: tag.slug,
        description: tag.description,
        color: tag.color,
        isActive: true,
        useCount: 0,
      });

      console.log(`✅ ${tag.name} (${tag.slug}) - criada com ID: ${created.id}`);
    } catch (error) {
      console.error(`❌ Erro ao criar ${tag.name}:`, error);
    }
  }

  // Show final list
  const final = await tagRepo.listActive();
  console.log(`\n✅ Total de tags ativas: ${final.length}`);
}

seedTags()
  .then(() => {
    console.log('\n✅ Seed de tags concluído!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Erro no seed:', err);
    process.exit(1);
  });