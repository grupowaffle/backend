import { getDrizzleClient } from './src/config/db';
import { BeehiivRepository } from './src/repositories';

async function debugBeehiivJson() {
  const env = {
    DATABASE_URL: process.env.DATABASE_URL,
  };

  const db = getDrizzleClient(env);
  const beehiivRepo = new BeehiivRepository(db);

  const postsResult = await beehiivRepo.listAllPosts({ page: 1, limit: 1 });
  const post = postsResult.data[0];

  if (!post) {
    console.log('❌ Nenhum post encontrado');
    return;
  }

  console.log('\n📰 Post:', post.title);
  console.log('📋 Estrutura completa do rawContent:\n');
  
  // rawContent deve ter a estrutura completa do JSON da BeehIV
  if (post.rawContent) {
    console.log(JSON.stringify(post.rawContent, null, 2));
  }

  console.log('\n📄 RSS Content (primeiros 2000 chars):');
  console.log(post.rssContent?.substring(0, 2000));
}

debugBeehiivJson()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
