import { getDrizzleClient } from './src/config/db';
import { CategoryRepository } from './src/repositories';

async function checkCategories() {
  const env = {
    DATABASE_URL: process.env.DATABASE_URL,
  };

  const db = getDrizzleClient(env);
  const categoryRepo = new CategoryRepository(db);

  const categories = await categoryRepo.list();

  console.log(`\n📁 Categorias no banco (${categories.length}):\n`);
  categories.forEach(cat => {
    console.log(`  - ${cat.name} (slug: ${cat.slug}, id: ${cat.id})`);
  });
}

checkCategories()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
