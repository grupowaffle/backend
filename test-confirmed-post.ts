import { getDrizzleClient } from './src/config/db';
import { BeehiivService } from './src/services/BeehiivService';

const env = {
  DATABASE_URL: process.env.DATABASE_URL,
  BEEHIIV_API_KEY: process.env.BEEHIIV_API_KEY,
  BEEHIIV_PUBLICATIONS: process.env.BEEHIIV_PUBLICATIONS,
};

const db = getDrizzleClient(env);
const service = new BeehiivService(db, env);

// Post fresh from API
const PUBLICATION_ID = 'pub_ce78b549-5923-439b-be24-3f24c454bc12';

console.log('📡 Fetching confirmed post from API...\n');

service.fetchLatestPost(PUBLICATION_ID, env.BEEHIIV_API_KEY)
  .then(async (post) => {
    if (!post) {
      console.log('❌ No post found');
      return;
    }

    console.log(`✅ Post: "${post.title}"`);
    console.log(`   Status: ${post.status}`);
    console.log(`   RSS length: ${post.content?.free?.rss?.length}\n`);

    // Convert
    const articles = await service.convertBeehiivPostToMultipleArticles(post, 'temp-id');

    console.log(`\n✅ ${articles.length} articles created:\n`);
    articles.forEach((a, i) => {
      console.log(`${i + 1}. "${a.title}"`);
      console.log(`   Category: ${a.categoryId}`);
      console.log(`   Excerpt: ${a.excerpt?.substring(0, 80)}...`);
      console.log('');
    });
  })
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
