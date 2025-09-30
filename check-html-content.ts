import { getDrizzleClient } from './src/config/db';
import { ArticleRepository } from './src/repositories';

const env = { DATABASE_URL: process.env.DATABASE_URL };
const db = getDrizzleClient(env);
const repo = new ArticleRepository(db);

// Get latest article
repo.list({ page: 1, limit: 1, filters: { source: 'beehiiv' } })
  .then(result => {
    const article = result.data[0];
    if (!article) {
      console.log('No article found');
      return;
    }

    console.log(`\n📰 ${article.title}\n`);
    
    const paragraphs = (article.content || []).filter((b: any) => b.type === 'paragraph');
    if (paragraphs.length > 0) {
      console.log('📄 Primeiro parágrafo (com HTML):');
      console.log('─'.repeat(80));
      console.log(paragraphs[0].data.text);
      console.log('─'.repeat(80));
    }

    const lists = (article.content || []).filter((b: any) => b.type === 'list');
    if (lists.length > 0) {
      console.log('\n📋 Primeiro item da lista (com HTML):');
      console.log('─'.repeat(80));
      console.log(lists[0].data.items[0]);
      console.log('─'.repeat(80));
    }
  })
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
