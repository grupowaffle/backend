import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDrizzleClient } from '../../config/db';
import { ArticleRepository, CategoryRepository } from '../../repositories';
import { Env } from '../../config/types/common';
import { eq, desc, and } from 'drizzle-orm';

// Validation schemas for public API
const listArticlesSchema = z.object({
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
  category: z.string().optional(),
  featured: z.string().transform(val => val === 'true').optional(),
  search: z.string().optional(),
});

const categorySchema = z.object({
  slug: z.string().min(1),
});

export class PublicAPIController {
  private app: Hono;
  private env: Env;
  private articleRepository: ArticleRepository;
  private categoryRepository: CategoryRepository;

  constructor(env: Env) {
    this.app = new Hono();
    this.env = env;
    
    // Initialize database and repositories
    const db = getDrizzleClient(env);
    this.articleRepository = new ArticleRepository(db);
    this.categoryRepository = new CategoryRepository(db);
    
    this.setupRoutes();
  }

  private setupRoutes() {
    // Health check for public API
    this.app.get('/health', async (c) => {
      return c.json({
        success: true,
        service: 'public-api',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      });
    });

    // Get latest articles (homepage)
    this.app.get('/articles', zValidator('query', listArticlesSchema), async (c) => {
      try {
        const { page, limit, category, featured, search } = c.req.valid('query');

        console.log('📰 Public API: Fetching articles with filters:', { 
          page, limit, category, featured, search 
        });

        // Build filters for published articles only
        const filters: any = {
          status: 'published',
        };

        if (category) {
          filters.categoryId = category;
        }

        if (featured !== undefined) {
          filters.isFeatured = featured;
        }

        const options = {
          page: page || 1,
          limit: Math.min(limit || 20, 50), // Max 50 articles per request
          sortBy: 'publishedAt',
          sortOrder: 'desc' as const,
          filters,
          search,
        };

        const result = await this.articleRepository.list(options);

        // Remove sensitive fields for public consumption
        const publicArticles = result.data.map(article => ({
          id: article.id,
          title: article.title,
          subtitle: article.subtitle,
          slug: article.slug,
          excerpt: article.excerpt,
          content: article.content,
          featuredImage: article.featuredImage,
          tags: article.tags,
          categoryId: article.categoryId,
          publishedAt: article.publishedAt,
          updatedAt: article.updatedAt,
          readTime: article.readTime,
          views: article.views,
          likes: article.likes,
          shares: article.shares,
          isFeatured: article.isFeatured,
          source: article.source, // 'manual' or 'beehiiv'
        }));

        return c.json({
          success: true,
          data: {
            articles: publicArticles,
            pagination: result.pagination,
          },
        });

      } catch (error) {
        console.error('❌ Error fetching public articles:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch articles',
        }, 500);
      }
    });

    // Get featured articles for homepage
    this.app.get('/articles/featured', async (c) => {
      try {
        console.log('⭐ Public API: Fetching featured articles');

        const result = await this.articleRepository.list({
          page: 1,
          limit: 10,
          sortBy: 'publishedAt',
          sortOrder: 'desc',
          filters: {
            status: 'published',
            isFeatured: true,
          },
        });

        const featuredArticles = result.data.map(article => ({
          id: article.id,
          title: article.title,
          subtitle: article.subtitle,
          slug: article.slug,
          excerpt: article.excerpt,
          featuredImage: article.featuredImage,
          categoryId: article.categoryId,
          publishedAt: article.publishedAt,
          readTime: article.readTime,
          views: article.views,
          source: article.source,
        }));

        return c.json({
          success: true,
          data: featuredArticles,
        });

      } catch (error) {
        console.error('❌ Error fetching featured articles:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch featured articles',
        }, 500);
      }
    });

    // Get single article by slug
    this.app.get('/articles/:slug', async (c) => {
      try {
        const slug = c.req.param('slug');
        console.log('📖 Public API: Fetching article by slug:', slug);

        const article = await this.articleRepository.findBySlug(slug);
        
        if (!article) {
          return c.json({
            success: false,
            error: 'Article not found',
          }, 404);
        }

        // Only return published articles
        if (article.status !== 'published') {
          return c.json({
            success: false,
            error: 'Article not found',
          }, 404);
        }

        // Increment view count
        await this.articleRepository.incrementViews(article.id);

        // Return public article data
        const publicArticle = {
          id: article.id,
          title: article.title,
          subtitle: article.subtitle,
          slug: article.slug,
          excerpt: article.excerpt,
          content: article.content,
          featuredImage: article.featuredImage,
          tags: article.tags,
          categoryId: article.categoryId,
          publishedAt: article.publishedAt,
          updatedAt: article.updatedAt,
          readTime: article.readTime,
          views: (article.views || 0) + 1, // Include the incremented view
          likes: article.likes,
          shares: article.shares,
          isFeatured: article.isFeatured,
          source: article.source,
          beehiivUrl: article.beehiivUrl, // Original BeehIV URL if available
        };

        return c.json({
          success: true,
          data: publicArticle,
        });

      } catch (error) {
        console.error('❌ Error fetching article by slug:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch article',
        }, 500);
      }
    });

    // Get articles by category
    this.app.get('/categories/:slug/articles', zValidator('param', categorySchema), zValidator('query', listArticlesSchema.omit({ category: true })), async (c) => {
      try {
        const { slug } = c.req.valid('param');
        const { page, limit, featured, search } = c.req.valid('query');

        console.log('📂 Public API: Fetching articles for category:', slug);

        // Find category by slug
        const category = await this.categoryRepository.findBySlug(slug);
        if (!category) {
          return c.json({
            success: false,
            error: 'Category not found',
          }, 404);
        }

        const filters: any = {
          status: 'published',
          categoryId: category.id,
        };

        if (featured !== undefined) {
          filters.isFeatured = featured;
        }

        const options = {
          page: page || 1,
          limit: Math.min(limit || 20, 50),
          sortBy: 'publishedAt',
          sortOrder: 'desc' as const,
          filters,
          search,
        };

        const result = await this.articleRepository.list(options);

        const publicArticles = result.data.map(article => ({
          id: article.id,
          title: article.title,
          subtitle: article.subtitle,
          slug: article.slug,
          excerpt: article.excerpt,
          featuredImage: article.featuredImage,
          tags: article.tags,
          categoryId: article.categoryId,
          publishedAt: article.publishedAt,
          readTime: article.readTime,
          views: article.views,
          source: article.source,
        }));

        return c.json({
          success: true,
          data: {
            category: {
              id: category.id,
              name: category.name,
              slug: category.slug,
              description: category.description,
              color: category.color,
            },
            articles: publicArticles,
            pagination: result.pagination,
          },
        });

      } catch (error) {
        console.error('❌ Error fetching articles by category:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch articles for category',
        }, 500);
      }
    });

    // Get all active categories
    this.app.get('/categories', async (c) => {
      try {
        console.log('📂 Public API: Fetching all categories');

        const categories = await this.categoryRepository.listActive();

        const publicCategories = categories.map(category => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          color: category.color,
          order: category.order,
        }));

        return c.json({
          success: true,
          data: publicCategories,
        });

      } catch (error) {
        console.error('❌ Error fetching categories:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch categories',
        }, 500);
      }
    });

    // Search articles
    this.app.get('/search', zValidator('query', z.object({
      q: z.string().min(1, 'Search query is required'),
      page: z.string().transform(Number).optional(),
      limit: z.string().transform(Number).optional(),
    })), async (c) => {
      try {
        const { q: query, page, limit } = c.req.valid('query');

        console.log('🔍 Public API: Searching articles for:', query);

        const options = {
          page: page || 1,
          limit: Math.min(limit || 20, 50),
          sortBy: 'publishedAt',
          sortOrder: 'desc' as const,
          filters: {
            status: 'published',
          },
          search: query,
        };

        const result = await this.articleRepository.list(options);

        const publicArticles = result.data.map(article => ({
          id: article.id,
          title: article.title,
          subtitle: article.subtitle,
          slug: article.slug,
          excerpt: article.excerpt,
          featuredImage: article.featuredImage,
          categoryId: article.categoryId,
          publishedAt: article.publishedAt,
          readTime: article.readTime,
          source: article.source,
        }));

        return c.json({
          success: true,
          data: {
            query,
            articles: publicArticles,
            pagination: result.pagination,
          },
        });

      } catch (error) {
        console.error('❌ Error searching articles:', error);
        return c.json({
          success: false,
          error: 'Failed to search articles',
        }, 500);
      }
    });

    // Like an article (simple endpoint - could be enhanced with user tracking)
    this.app.post('/articles/:slug/like', async (c) => {
      try {
        const slug = c.req.param('slug');
        console.log('👍 Public API: Liking article:', slug);

        const article = await this.articleRepository.findBySlug(slug);
        
        if (!article || article.status !== 'published') {
          return c.json({
            success: false,
            error: 'Article not found',
          }, 404);
        }

        // Increment likes
        await this.articleRepository.incrementLikes(article.id);

        return c.json({
          success: true,
          data: {
            likes: (article.likes || 0) + 1,
          },
        });

      } catch (error) {
        console.error('❌ Error liking article:', error);
        return c.json({
          success: false,
          error: 'Failed to like article',
        }, 500);
      }
    });

    // Share an article (tracking endpoint)
    this.app.post('/articles/:slug/share', async (c) => {
      try {
        const slug = c.req.param('slug');
        console.log('📤 Public API: Sharing article:', slug);

        const article = await this.articleRepository.findBySlug(slug);
        
        if (!article || article.status !== 'published') {
          return c.json({
            success: false,
            error: 'Article not found',
          }, 404);
        }

        // Increment shares
        await this.articleRepository.incrementShares(article.id);

        return c.json({
          success: true,
          data: {
            shares: (article.shares || 0) + 1,
          },
        });

      } catch (error) {
        console.error('❌ Error sharing article:', error);
        return c.json({
          success: false,
          error: 'Failed to track article share',
        }, 500);
      }
    });

    // Get site statistics (for footer or about page)
    this.app.get('/stats', async (c) => {
      try {
        console.log('📊 Public API: Fetching site stats');

        // This could be cached for better performance
        const totalArticles = await this.articleRepository.count({ status: 'published' });
        const totalCategories = await this.categoryRepository.count({ isActive: true });

        return c.json({
          success: true,
          data: {
            totalArticles,
            totalCategories,
            lastUpdated: new Date().toISOString(),
          },
        });

      } catch (error) {
        console.error('❌ Error fetching site stats:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch statistics',
        }, 500);
      }
    });
  }

  /**
   * Get the Hono app
   */
  getApp() {
    return this.app;
  }
}