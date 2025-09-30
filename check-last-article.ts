import { getDrizzleClient } from './src/config/db';
import { ArticleRepository } from './src/repositories';

const env = { DATABASE_URL: process.env.DATABASE_URL };
const db = getDrizzleClient(env);
const repo = new ArticleRepository(db);

repo.list({ page: 1, limit: 5, filters: { source: 'beehiiv' }})
  .then(result => {
    const article = result.data[0];

    if (!article) {
      console.log('No articles found');
      return;
    }

    console.log(`\n📰 ${article.title}`);
    console.log(`📁 Newsletter: ${article.newsletter}`);
    console.log(`📅 Status: ${article.status}`);
    console.log(`🔖 Category ID: ${article.categoryId}`);
    console.log(`🆔 Source ID: ${article.sourceId}\n`);
  })
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });