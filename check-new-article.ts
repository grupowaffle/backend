import { getDrizzleClient } from './src/config/db';
import { ArticleRepository } from './src/repositories';

const env = { DATABASE_URL: process.env.DATABASE_URL };
const db = getDrizzleClient(env);
const repo = new ArticleRepository(db);

// Find article by sourceId
repo.list({ page: 1, limit: 50, filters: { source: 'beehiiv' }})
  .then(result => {
    const article = result.data.find((a: any) => 
      a.sourceId === 'post_04b5d16d-4cbb-4c46-99ea-e98edb00e51d-1'
    );

    if (!article) {
      console.log('Article not found');
      return;
    }

    console.log(`\n📰 ${article.title}\n`);
    
    const paragraphs = article.content.filter((b: any) => b.type === 'paragraph');
    
    console.log('📄 Parágrafos com formatação:\n');
    paragraphs.slice(0, 3).forEach((p: any, idx: number) => {
      console.log(`${idx + 1}. ${p.data.text}`);
      console.log('');
    });
  })
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
