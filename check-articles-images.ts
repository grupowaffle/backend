import { getDrizzleClient } from './src/config/db';
import { ArticleRepository } from './src/repositories';

const env = { DATABASE_URL: process.env.DATABASE_URL };
const db = getDrizzleClient(env);
const repo = new ArticleRepository(db);

repo.list({ page: 1, limit: 7, filters: { source: 'beehiiv' }})
  .then(result => {
    console.log('\n📰 Artigos com imagens:\n');
    result.data.forEach((a, idx) => {
      console.log(`${idx + 1}. ${a.title.substring(0, 50)}...`);
      console.log(`   Image: ${a.featuredImage ? 'SIM ✅' : 'NAO ❌'}`);
      if (a.featuredImage) {
        console.log(`   URL: ${a.featuredImage.substring(0, 70)}...`);
      }
      console.log('');
    });
  })
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
