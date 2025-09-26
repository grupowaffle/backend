import { getDrizzleClient } from './src/config/db';
import { BeehiivRepository } from './src/repositories';

async function listPosts() {
  const env = {
    DATABASE_URL: process.env.DATABASE_URL,
  };

  const db = getDrizzleClient(env);
  const beehiivRepo = new BeehiivRepository(db);

  const postsResult = await beehiivRepo.listAllPosts({ page: 1, limit: 10 });
  
  console.log(`\n📰 Posts no banco (${postsResult.total}):\n`);
  
  postsResult.data.forEach((post, i) => {
    console.log(`${i + 1}. ${post.title}`);
    console.log(`   ID: ${post.beehiivId}`);
    console.log(`   Status: ${post.status}`);
    console.log(`   Publicado: ${post.publishDate || 'não publicado'}`);
    console.log(`   RSS length: ${post.rssContent?.length || 0} chars`);
    
    // Check if has real content
    if (post.rssContent) {
      const hasRealTitle = !post.rssContent.includes('<h1 class="heading" style="text-align:left;" id="ttulo">Título</h1>');
      const hasContent = post.rssContent.length > 5000;
      console.log(`   ✅ Conteúdo real: ${hasRealTitle ? 'SIM' : 'NÃO (template)'}`);
    }
    console.log('');
  });
}

listPosts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
