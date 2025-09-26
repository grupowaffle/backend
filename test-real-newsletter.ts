import { getDrizzleClient } from './src/config/db';
import { BeehiivService } from './src/services/BeehiivService';
import { BeehiivRepository } from './src/repositories';

async function testRealNewsletter() {
  const env = {
    DATABASE_URL: process.env.DATABASE_URL,
    BEEHIIV_API_KEY: process.env.BEEHIIV_API_KEY,
    BEEHIIV_PUBLICATIONS: process.env.BEEHIIV_PUBLICATIONS,
  };

  const db = getDrizzleClient(env);
  const beehiivService = new BeehiivService(db, env);
  const beehiivRepo = new BeehiivRepository(db);

  // Get post with real content
  const post = await beehiivRepo.findPostByBeehiivId('post_3a4c05ca-797b-414c-a0cf-a0ade15155a7');

  if (!post) {
    console.log('❌ Post não encontrado');
    return;
  }

  console.log(`\n✅ Testing post: "${post.title}"`);
  console.log(`   RSS length: ${post.rssContent?.length} chars\n`);

  // Sample of RSS
  console.log('📄 RSS Sample (chars 1000-3000):');
  console.log(post.rssContent?.substring(1000, 3000));
  console.log('\n');

  // Convert
  const postResponse = {
    id: post.beehiivId,
    title: post.title,
    subtitle: post.subtitle || '',
    authors: [],
    created: post.createdTimestamp || Math.floor(Date.now() / 1000),
    status: post.status,
    publish_date: post.publishDate ? Math.floor(post.publishDate.getTime() / 1000) : null,
    displayed_date: post.displayedDate ? Math.floor(post.displayedDate.getTime() / 1000) : null,
    split_tested: post.splitTested || false,
    subject_line: post.subjectLine || '',
    preview_text: post.previewText || '',
    slug: post.slug || '',
    thumbnail_url: post.thumbnailUrl || '',
    web_url: post.webUrl || '',
    audience: post.audience || '',
    platform: post.platform || '',
    content_tags: post.contentTags || [],
    meta_default_description: post.metaDescription,
    meta_default_title: post.metaTitle,
    hidden_from_feed: post.hiddenFromFeed || false,
    content: {
      free: {
        rss: post.rssContent || ''
      }
    }
  };

  console.log('🔄 Converting to articles...\n');
  const articles = await beehiivService.convertBeehiivPostToMultipleArticles(postResponse, post.id);

  console.log(`\n✅ Conversion complete: ${articles.length} articles\n`);
  
  articles.forEach((article, i) => {
    console.log(`${i + 1}. "${article.title}"`);
    console.log(`   Slug: ${article.slug}`);
    console.log(`   Category: ${article.categoryId || 'null'}`);
    console.log(`   Excerpt: ${article.excerpt?.substring(0, 100)}...`);
    console.log(`   Blocks: ${article.content?.length || 0}`);
    if (article.featuredImage) {
      console.log(`   Image: ${article.featuredImage.substring(0, 60)}...`);
    }
    console.log('');
  });
}

testRealNewsletter()
  .then(() => {
    console.log('✅ Test complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
