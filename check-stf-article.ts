import { getDrizzleClient } from './src/config/db';
import { ArticleRepository } from './src/repositories';

const env = { DATABASE_URL: process.env.DATABASE_URL };
const db = getDrizzleClient(env);
const repo = new ArticleRepository(db);

repo.findBySlug('as-principais-manchetes-ao-redor-do-nosso-pas')
  .then(article => {
    if (!article || !article.content) {
      console.log('Article not found');
      return;
    }

    console.log(`\n📰 ${article.title}\n`);
    
    const paragraphs = article.content.filter((b: any) => b.type === 'paragraph');
    console.log(`Total parágrafos: ${paragraphs.length}\n`);

    paragraphs.slice(0, 5).forEach((p: any, i: number) => {
      console.log(`${i + 1}. ${p.data.text.substring(0, 150)}...`);
    });
  })
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
