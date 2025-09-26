import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ultraCacheMiddleware } from '../middlewares/ultraCacheMiddleware';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { createCMSRoutes } from './cms';
import { createPublicRoutes } from './public';
import { errorHandler } from '../middleware/errorHandler';
import { apiRateLimit } from '../middleware/rateLimit';

// Tipos e handlers
import { Env, UserData } from '../config/types/common';
/**
 * Tipo da aplicação Hono com bindings e variáveis personalizadas
 * @typedef {Hono} AppType
 * @property {Env} Bindings - Variáveis de ambiente da aplicação
 * @property {{user: UserData}} Variables - Variáveis de contexto, incluindo dados do usuário
 */
export type AppType = Hono<{
  Bindings: Env;
  Variables: {
    user: UserData;
  };
}>;

/**
 * Cria e configura uma nova instância da aplicação Hono ULTRA-OTIMIZADA
 * @param {Env} env - Objeto contendo as variáveis de ambiente
 * @returns {AppType} Instância configurada da aplicação Hono
 */
export function createApp(env: Env): AppType {
  const app = new Hono<{
    Bindings: Env;
    Variables: {
      user: UserData;
    };
  }>();

  // Middlewares globais
  app.use('*', cors());
  app.use('*', errorHandler); // Add error handler early
  app.use('*', ultraCacheMiddleware);
  
  // Apply rate limiting to public API
  app.use('/api/public/*', apiRateLimit);

  // Mount routes  
  app.route('/health', healthRoutes());
  app.route('/auth', authRoutes());
  app.route('/api/cms', createCMSRoutes(env));
  app.route('/api/public', createPublicRoutes(env));

  // Test article creation (temporary)
  app.post('/debug/test-article-creation', async (c) => {
    try {
      const { ArticleRepository } = await import('../repositories');
      const { getDrizzleClient } = await import('../config/db');
      const { generateId } = await import('../lib/cuid');

      const db = getDrizzleClient(env);
      const articleRepository = new ArticleRepository(db);

      // Create minimal test article
      const testArticle = {
        id: generateId(),
        title: 'Test Article from Debug',
        slug: `test-article-${Date.now()}`,
        content: [{ type: 'paragraph', data: { text: 'This is a test article.' } }],
        excerpt: 'Test excerpt',
        status: 'draft' as const,
        source: 'beehiiv' as const,
        newsletter: 'test',
        featuredImage: null,
        tags: [],
        seoTitle: null,
        seoDescription: null,
        seoKeywords: [],
        isFeatured: false,
        views: 0,
        shares: 0,
        likes: 0,
        beehiivPostId: 'test-post-id',
      };

      console.log('🧪 Creating test article:', testArticle.title);
      const article = await articleRepository.create(testArticle);
      console.log('✅ Test article created:', article.id);

      return c.json({
        success: true,
        message: 'Test article created successfully',
        data: {
          id: article.id,
          title: article.title,
          source: article.source
        }
      });
    } catch (error) {
      console.error('❌ Test article creation failed:', error);
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Creation failed',
      }, 500);
    }
  });

  // Convert existing Beehiiv posts to articles (temporary)
  app.post('/debug/convert-beehiiv-posts', async (c) => {
    try {
      const { BeehiivService, BeehiivRepository } = await import('../services/BeehiivService');
      const { getDrizzleClient } = await import('../config/db');

      const db = getDrizzleClient(env);
      const beehiivService = new BeehiivService(db, env);

      // Get all beehiiv posts
      const beehiivPosts = await db.select().from((await import('../config/db/schema')).beehiivPosts).limit(5);

      const results = [];

      for (const post of beehiivPosts) {
        try {
          console.log(`🔄 Converting post: ${post.title}`);

          // Convert beehiiv post format to BeehiivPostResponse format
          const postResponse = {
            id: post.beehiivId,
            title: post.title,
            subtitle: post.subtitle,
            subject_line: post.subjectLine,
            preview_text: post.previewText,
            slug: post.slug,
            status: post.status,
            content: {
              free: {
                rss: post.rssContent || ''
              }
            },
            thumbnail_url: post.thumbnailUrl,
            web_url: post.webUrl,
            content_tags: post.contentTags,
            meta_default_title: post.metaTitle,
            meta_default_description: post.metaDescription
          };

          const article = await beehiivService.convertBeehiivPostToArticle(postResponse, post.id);

          results.push({
            postId: post.id,
            postTitle: post.title,
            articleId: article.id,
            articleTitle: article.title,
            success: true
          });

        } catch (error) {
          console.error(`❌ Error converting post ${post.title}:`, error);
          results.push({
            postId: post.id,
            postTitle: post.title,
            success: false,
            error: error instanceof Error ? error.message : 'Conversion failed'
          });
        }
      }

      return c.json({
        success: true,
        message: `Processed ${beehiivPosts.length} posts`,
        data: results
      });
    } catch (error) {
      console.error('Conversion error:', error);
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Conversion failed',
      }, 500);
    }
  });

  // Sync Beehiiv route (temporary)
  app.post('/debug/sync-beehiiv', async (c) => {
    try {
      const { BeehiivService } = await import('../services/BeehiivService');
      const { getDrizzleClient } = await import('../config/db');

      const db = getDrizzleClient(env);
      const beehiivService = new BeehiivService(db, env);

      console.log('🚀 Starting manual Beehiiv sync...');
      const result = await beehiivService.syncLatestFromAllPublications();

      return c.json({
        success: result.success,
        message: 'Sync completed',
        data: result.results
      });
    } catch (error) {
      console.error('Sync error:', error);
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      }, 500);
    }
  });

  // Debug route (temporary)
  app.get('/debug/articles', async (c) => {
    try {
      const { ArticleRepository, BeehiivRepository } = await import('../repositories');
      const { getDrizzleClient } = await import('../config/db');

      const db = getDrizzleClient(env);
      const articleRepository = new ArticleRepository(db);
      const beehiivRepository = new BeehiivRepository(db);

      const articleResult = await articleRepository.list({
        page: 1,
        limit: 100,
        filters: {},
        includeRelations: false,
      });

      const bySource = articleResult.data.reduce((acc, item) => {
        const source = item.source || 'manual';
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Check beehiiv posts
      let beehiivPosts = [];
      try {
        const beehiivResult = await db.select().from((await import('../config/db/schema')).beehiivPosts).limit(10);
        beehiivPosts = beehiivResult.map(post => ({
          id: post.id,
          beehiivId: post.beehiivId,
          title: post.title,
          status: post.status,
          createdAt: post.createdAt
        }));
      } catch (error) {
        console.error('Error fetching beehiiv posts:', error);
      }

      return c.json({
        success: true,
        data: {
          articles: {
            total: articleResult.pagination.total,
            bySource,
            recentArticles: articleResult.data.slice(0, 5).map(article => ({
              id: article.id,
              title: article.title,
              source: article.source || 'manual',
              status: article.status,
              createdAt: article.createdAt
            }))
          },
          beehiivPosts: {
            total: beehiivPosts.length,
            posts: beehiivPosts
          }
        },
      });
    } catch (error) {
      console.error('Debug endpoint error:', error);
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Debug failed',
      }, 500);
    }
  });

  // Root route
  app.get('/', (c) => {
    return c.json({
      message: 'The News CMS API',
      version: '1.0.0',
      endpoints: {
        health: '/health',
        auth: '/auth',
        cms: '/api/cms',
        articles: '/api/cms/articles',
        categories: '/api/cms/categories',
        beehiiv: '/api/cms/beehiiv',
        media: '/api/cms/media',
        'public-api': '/api/public',
        debug: '/debug/articles',
      },
    });
  });

  return app;
}