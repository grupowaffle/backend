import { getDrizzleClient } from './src/config/db';
import { ArticleRepository } from './src/repositories';

const env = { DATABASE_URL: process.env.DATABASE_URL };
const db = getDrizzleClient(env);
const repo = new ArticleRepository(db);

repo.findBySlug('93-dos-brasileiros-usam-whatsapp-todo-dia-1758656969187')
  .then(article => {
    if (!article) {
      console.log('Article not found');
      return;
    }

    console.log(`\n📰 ${article.title}\n`);
    console.log(`📊 ${article.content?.length || 0} blocos:\n`);

    article.content?.forEach((block: any, i: number) => {
      console.log(`${i + 1}. [${block.type}]`);
      if (block.type === 'paragraph') {
        console.log(`   ${block.data.text.substring(0, 100)}...`);
      } else if (block.type === 'list') {
        console.log(`   Items: ${block.data.items.length}`);
        block.data.items.forEach((item: string, j: number) => {
          console.log(`     ${j + 1}. ${item}`);
        });
      } else if (block.type === 'image') {
        console.log(`   ${block.data.file.url.substring(0, 60)}...`);
      } else if (block.type === 'header') {
        console.log(`   H${block.data.level}: ${block.data.text}`);
      }
      console.log('');
    });
  })
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
