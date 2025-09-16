import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDrizzleClient } from '../../config/db';
import { ArticleRepository, CategoryRepository, AuthorRepository, TagRepository } from '../../repositories';
import { EngagementTrackingService } from '../../services/EngagementTrackingService';
import { Env } from '../../config/types/common';
import { eq, desc, and } from 'drizzle-orm';

// Validation schemas for public API
const listArticlesSchema = z.object({
  page: z.string().transform(val => parseInt(val) || 1).default('1'),
  limit: z.string().transform(val => Math.min(50, parseInt(val) || 20)).default('20'),
  category: z.string().optional(),
  author: z.string().optional(),
  tags: z.string().optional(), // Comma-separated tags
  date: z.string().optional(), // YYYY-MM-DD format
  featured: z.string().transform(val => val === 'true').optional(),
  source: z.enum(['manual', 'beehiiv']).optional(),
  sort: z.enum(['publishedAt', 'views', 'likes', 'shares', 'title']).default('publishedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
});

const categorySchema = z.object({
  slug: z.string().min(1),
});

const authorSchema = z.object({
  slug: z.string().min(1),
});

const tagSchema = z.object({
  slug: z.string().min(1),
});

const listAuthorsSchema = z.object({
  page: z.string().transform(val => parseInt(val) || 1).default('1'),
  limit: z.string().transform(val => Math.min(50, parseInt(val) || 20)).default('20'),
  search: z.string().optional(),
  featured: z.string().transform(val => val === 'true').optional(),
  sort: z.enum(['name', 'articleCount', 'createdAt']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

const listTagsSchema = z.object({
  page: z.string().transform(val => parseInt(val) || 1).default('1'),
  limit: z.string().transform(val => Math.min(50, parseInt(val) || 20)).default('20'),
  search: z.string().optional(),
  sort: z.enum(['name', 'useCount', 'createdAt']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export class PublicAPIController {
  private app: Hono;
  private env: Env;
  private articleRepository: ArticleRepository;
  private categoryRepository: CategoryRepository;
  private authorRepository: AuthorRepository;
  private tagRepository: TagRepository;
  private engagementTrackingService: EngagementTrackingService;

  constructor(env: Env) {
    this.app = new Hono();
    this.env = env;
    
    // Initialize database and repositories
    const db = getDrizzleClient(env);
    this.articleRepository = new ArticleRepository(db);
    this.categoryRepository = new CategoryRepository(db);
    this.authorRepository = new AuthorRepository(db);
    this.tagRepository = new TagRepository(db);
    this.engagementTrackingService = new EngagementTrackingService(db);
    
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
        const { page, limit, category, author, tags, date, featured, source, sort, order, search } = c.req.valid('query');

        console.log('📰 Public API: Fetching articles with filters:', { 
          page, limit, category, author, tags, date, featured, source, sort, order, search 
        });

        // Build filters for published articles only
        const filters: any = {
          status: 'published',
        };

        if (category) {
          filters.categoryId = category;
        }

        if (author) {
          filters.authorId = author;
        }

        if (tags) {
          const tagList = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
          if (tagList.length > 0) {
            filters.tags = tagList;
          }
        }

        if (date) {
          const dateObj = new Date(date);
          if (!isNaN(dateObj.getTime())) {
            const startOfDay = new Date(dateObj);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(dateObj);
            endOfDay.setHours(23, 59, 59, 999);
            filters.dateRange = {
              start: startOfDay,
              end: endOfDay
            };
          }
        }

        if (featured !== undefined) {
          filters.isFeatured = featured;
        }

        if (source) {
          filters.source = source;
        }

        const options = {
          page,
          limit,
          sortBy: sort,
          sortOrder: order as 'asc' | 'desc',
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
          authorId: article.authorId,
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

        // Track detailed engagement
        const userAgent = c.req.header('user-agent') || '';
        const ipAddress = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
        const referrer = c.req.header('referer') || 'direct';
        
        await this.engagementTrackingService.trackView(article.id, {
          userAgent,
          ipAddress,
          referrer,
          device: this.engagementTrackingService.detectDevice(userAgent),
          browser: this.engagementTrackingService.detectBrowser(userAgent),
          os: this.engagementTrackingService.detectOS(userAgent),
        });

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

    // Get related articles
    this.app.get('/articles/:slug/related', async (c) => {
      try {
        const slug = c.req.param('slug');
        console.log('🔗 Public API: Fetching related articles for:', slug);

        const article = await this.articleRepository.findBySlug(slug);
        
        if (!article || article.status !== 'published') {
          return c.json({
            success: false,
            error: 'Article not found',
          }, 404);
        }

        // Find related articles by category and tags
        const relatedOptions = {
          page: 1,
          limit: 6,
          sortBy: 'publishedAt' as const,
          sortOrder: 'desc' as const,
          filters: {
            status: 'published',
            categoryId: article.categoryId,
            excludeId: article.id, // Exclude current article
          },
        };

        const relatedResult = await this.articleRepository.list(relatedOptions);

        const relatedArticles = relatedResult.data.map(relatedArticle => ({
          id: relatedArticle.id,
          title: relatedArticle.title,
          subtitle: relatedArticle.subtitle,
          slug: relatedArticle.slug,
          excerpt: relatedArticle.excerpt,
          featuredImage: relatedArticle.featuredImage,
          categoryId: relatedArticle.categoryId,
          authorId: relatedArticle.authorId,
          publishedAt: relatedArticle.publishedAt,
          readTime: relatedArticle.readTime,
          views: relatedArticle.views,
          source: relatedArticle.source,
        }));

        return c.json({
          success: true,
          data: relatedArticles,
        });

      } catch (error) {
        console.error('❌ Error fetching related articles:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch related articles',
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
    // Usage: GET /api/public/search?q=search_term&page=1&limit=20
    this.app.get('/search', zValidator('query', z.object({
      q: z.string().optional(), // Search query (optional - returns empty results if not provided)
      page: z.string().transform(val => parseInt(val) || 1).default('1'),
      limit: z.string().transform(val => Math.min(50, parseInt(val) || 20)).default('20'),
    })), async (c) => {
      try {
        const { q: query, page, limit } = c.req.valid('query');

        // If no search query provided, return empty results
        if (!query || query.trim().length === 0) {
          return c.json({
            success: true,
            data: {
              query: query || '',
              articles: [],
              pagination: {
                page,
                limit,
                total: 0,
                totalPages: 0,
                hasNext: false,
                hasPrev: false,
              },
            },
          });
        }

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

        // Track like with engagement data
        const userAgent = c.req.header('user-agent') || '';
        const ipAddress = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
        
        await this.engagementTrackingService.trackLike(article.id, {
          userAgent,
          ipAddress,
          device: this.engagementTrackingService.detectDevice(userAgent),
          browser: this.engagementTrackingService.detectBrowser(userAgent),
          os: this.engagementTrackingService.detectOS(userAgent),
        });

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

        // Track share with engagement data
        const userAgent = c.req.header('user-agent') || '';
        const ipAddress = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
        const referrer = c.req.header('referer') || 'direct';
        
        await this.engagementTrackingService.trackShare(article.id, {
          userAgent,
          ipAddress,
          referrer,
          device: this.engagementTrackingService.detectDevice(userAgent),
          browser: this.engagementTrackingService.detectBrowser(userAgent),
          os: this.engagementTrackingService.detectOS(userAgent),
        });

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

    // Track time on page
    this.app.post('/articles/:slug/time', async (c) => {
      try {
        const slug = c.req.param('slug');
        const { seconds } = await c.req.json();

        console.log('⏱️ Public API: Tracking time on page for:', slug, 'seconds:', seconds);

        const article = await this.articleRepository.findBySlug(slug);
        
        if (!article || article.status !== 'published') {
          return c.json({
            success: false,
            error: 'Article not found',
          }, 404);
        }

        const userAgent = c.req.header('user-agent') || '';
        const ipAddress = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
        
        await this.engagementTrackingService.trackTimeOnPage(article.id, seconds, {
          userAgent,
          ipAddress,
          device: this.engagementTrackingService.detectDevice(userAgent),
          browser: this.engagementTrackingService.detectBrowser(userAgent),
          os: this.engagementTrackingService.detectOS(userAgent),
        });

        return c.json({
          success: true,
          data: {
            message: 'Time tracked successfully',
          },
        });

      } catch (error) {
        console.error('❌ Error tracking time on page:', error);
        return c.json({
          success: false,
          error: 'Failed to track time on page',
        }, 500);
      }
    });

    // Track bounce (user left quickly)
    this.app.post('/articles/:slug/bounce', async (c) => {
      try {
        const slug = c.req.param('slug');

        console.log('📉 Public API: Tracking bounce for:', slug);

        const article = await this.articleRepository.findBySlug(slug);
        
        if (!article || article.status !== 'published') {
          return c.json({
            success: false,
            error: 'Article not found',
          }, 404);
        }

        const userAgent = c.req.header('user-agent') || '';
        const ipAddress = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
        
        await this.engagementTrackingService.trackBounce(article.id, {
          userAgent,
          ipAddress,
          device: this.engagementTrackingService.detectDevice(userAgent),
          browser: this.engagementTrackingService.detectBrowser(userAgent),
          os: this.engagementTrackingService.detectOS(userAgent),
        });

        return c.json({
          success: true,
          data: {
            message: 'Bounce tracked successfully',
          },
        });

      } catch (error) {
        console.error('❌ Error tracking bounce:', error);
        return c.json({
          success: false,
          error: 'Failed to track bounce',
        }, 500);
      }
    });

    // Track click through (user clicked on a link)
    this.app.post('/articles/:slug/click-through', async (c) => {
      try {
        const slug = c.req.param('slug');
        const { linkUrl } = await c.req.json();

        console.log('🔗 Public API: Tracking click through for:', slug, 'link:', linkUrl);

        const article = await this.articleRepository.findBySlug(slug);
        
        if (!article || article.status !== 'published') {
          return c.json({
            success: false,
            error: 'Article not found',
          }, 404);
        }

        const userAgent = c.req.header('user-agent') || '';
        const ipAddress = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
        
        await this.engagementTrackingService.trackClickThrough(article.id, {
          userAgent,
          ipAddress,
          device: this.engagementTrackingService.detectDevice(userAgent),
          browser: this.engagementTrackingService.detectBrowser(userAgent),
          os: this.engagementTrackingService.detectOS(userAgent),
        });

        return c.json({
          success: true,
          data: {
            message: 'Click through tracked successfully',
          },
        });

      } catch (error) {
        console.error('❌ Error tracking click through:', error);
        return c.json({
          success: false,
          error: 'Failed to track click through',
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

    // ===== AUTHORS API =====

    // Get all authors
    this.app.get('/authors', zValidator('query', listAuthorsSchema), async (c) => {
      try {
        const { page, limit, search, featured, sort, order } = c.req.valid('query');

        console.log('👥 Public API: Fetching authors with filters:', { 
          page, limit, search, featured, sort, order 
        });

        const filters: any = {
          isActive: true,
        };

        if (search) {
          filters.search = search;
        }

        if (featured !== undefined) {
          filters.featuredAuthor = featured;
        }

        const options = {
          page,
          limit,
          sortBy: sort,
          sortOrder: order as 'asc' | 'desc',
          filters,
        };

        const result = await this.authorRepository.list(options);

        return c.json({
          success: true,
          data: {
            authors: result.data,
            pagination: result.pagination,
          },
        });

      } catch (error) {
        console.error('❌ Error fetching authors:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch authors',
        }, 500);
      }
    });

    // Get single author by slug
    this.app.get('/authors/:slug', zValidator('param', authorSchema), async (c) => {
      try {
        const { slug } = c.req.valid('param');
        console.log('👤 Public API: Fetching author by slug:', slug);

        const author = await this.authorRepository.findBySlug(slug);
        
        if (!author || !author.isActive) {
          return c.json({
            success: false,
            error: 'Author not found',
          }, 404);
        }

        return c.json({
          success: true,
          data: author,
        });

      } catch (error) {
        console.error('❌ Error fetching author by slug:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch author',
        }, 500);
      }
    });

    // Get articles by author
    this.app.get('/authors/:slug/articles', zValidator('param', authorSchema), zValidator('query', listArticlesSchema.omit({ author: true })), async (c) => {
      try {
        const { slug } = c.req.valid('param');
        const { page, limit, category, tags, date, featured, source, sort, order, search } = c.req.valid('query');

        console.log('📝 Public API: Fetching articles for author:', slug);

        // Find author by slug
        const author = await this.authorRepository.findBySlug(slug);
        if (!author || !author.isActive) {
          return c.json({
            success: false,
            error: 'Author not found',
          }, 404);
        }

        const filters: any = {
          status: 'published',
          authorId: author.id,
        };

        if (category) {
          filters.categoryId = category;
        }

        if (tags) {
          const tagList = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
          if (tagList.length > 0) {
            filters.tags = tagList;
          }
        }

        if (date) {
          const dateObj = new Date(date);
          if (!isNaN(dateObj.getTime())) {
            const startOfDay = new Date(dateObj);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(dateObj);
            endOfDay.setHours(23, 59, 59, 999);
            filters.dateRange = {
              start: startOfDay,
              end: endOfDay
            };
          }
        }

        if (featured !== undefined) {
          filters.isFeatured = featured;
        }

        if (source) {
          filters.source = source;
        }

        const options = {
          page,
          limit,
          sortBy: sort,
          sortOrder: order as 'asc' | 'desc',
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
          authorId: article.authorId,
          publishedAt: article.publishedAt,
          readTime: article.readTime,
          views: article.views,
          source: article.source,
        }));

        return c.json({
          success: true,
          data: {
            author: {
              id: author.id,
              name: author.name,
              slug: author.slug,
              bio: author.bio,
              avatar: author.avatar,
              expertise: author.expertise,
              articleCount: author.articleCount,
            },
            articles: publicArticles,
            pagination: result.pagination,
          },
        });

      } catch (error) {
        console.error('❌ Error fetching articles by author:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch articles for author',
        }, 500);
      }
    });

    // ===== TAGS API =====

    // Get all tags
    this.app.get('/tags', zValidator('query', listTagsSchema), async (c) => {
      try {
        const { page, limit, search, sort, order } = c.req.valid('query');

        console.log('🏷️ Public API: Fetching tags with filters:', { 
          page, limit, search, sort, order 
        });

        const filters: any = {
          isActive: true,
        };

        if (search) {
          filters.search = search;
        }

        const options = {
          page,
          limit,
          sortBy: sort,
          sortOrder: order as 'asc' | 'desc',
          filters,
        };

        const result = await this.tagRepository.list(options);

        return c.json({
          success: true,
          data: {
            tags: result.data,
            pagination: result.pagination,
          },
        });

      } catch (error) {
        console.error('❌ Error fetching tags:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch tags',
        }, 500);
      }
    });

    // Get single tag by slug
    this.app.get('/tags/:slug', zValidator('param', tagSchema), async (c) => {
      try {
        const { slug } = c.req.valid('param');
        console.log('🏷️ Public API: Fetching tag by slug:', slug);

        const tag = await this.tagRepository.findBySlug(slug);
        
        if (!tag || !tag.isActive) {
          return c.json({
            success: false,
            error: 'Tag not found',
          }, 404);
        }

        return c.json({
          success: true,
          data: tag,
        });

      } catch (error) {
        console.error('❌ Error fetching tag by slug:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch tag',
        }, 500);
      }
    });

    // Get articles by tag
    this.app.get('/tags/:slug/articles', zValidator('param', tagSchema), zValidator('query', listArticlesSchema.omit({ tags: true })), async (c) => {
      try {
        const { slug } = c.req.valid('param');
        const { page, limit, category, author, date, featured, source, sort, order, search } = c.req.valid('query');

        console.log('📝 Public API: Fetching articles for tag:', slug);

        // Find tag by slug
        const tag = await this.tagRepository.findBySlug(slug);
        if (!tag || !tag.isActive) {
          return c.json({
            success: false,
            error: 'Tag not found',
          }, 404);
        }

        const filters: any = {
          status: 'published',
          tags: [tag.name], // Filter by tag name
        };

        if (category) {
          filters.categoryId = category;
        }

        if (author) {
          filters.authorId = author;
        }

        if (date) {
          const dateObj = new Date(date);
          if (!isNaN(dateObj.getTime())) {
            const startOfDay = new Date(dateObj);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(dateObj);
            endOfDay.setHours(23, 59, 59, 999);
            filters.dateRange = {
              start: startOfDay,
              end: endOfDay
            };
          }
        }

        if (featured !== undefined) {
          filters.isFeatured = featured;
        }

        if (source) {
          filters.source = source;
        }

        const options = {
          page,
          limit,
          sortBy: sort,
          sortOrder: order as 'asc' | 'desc',
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
          authorId: article.authorId,
          publishedAt: article.publishedAt,
          readTime: article.readTime,
          views: article.views,
          source: article.source,
        }));

        return c.json({
          success: true,
          data: {
            tag: {
              id: tag.id,
              name: tag.name,
              slug: tag.slug,
              color: tag.color,
              description: tag.description,
              useCount: tag.useCount,
            },
            articles: publicArticles,
            pagination: result.pagination,
          },
        });

      } catch (error) {
        console.error('❌ Error fetching articles by tag:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch articles for tag',
        }, 500);
      }
    });

    // Get popular tags
    this.app.get('/tags/popular', async (c) => {
      try {
        console.log('🔥 Public API: Fetching popular tags');

        const popularTags = await this.tagRepository.listPopular(20);

        return c.json({
          success: true,
          data: popularTags,
        });

      } catch (error) {
        console.error('❌ Error fetching popular tags:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch popular tags',
        }, 500);
      }
    });

    // ===== RSS FEED API =====

    // Get RSS feed for all articles
    this.app.get('/rss', async (c) => {
      try {
        console.log('📡 Public API: Generating RSS feed');

        const result = await this.articleRepository.list({
          page: 1,
          limit: 50,
          sortBy: 'publishedAt',
          sortOrder: 'desc',
          filters: {
            status: 'published',
          },
        });

        const rssItems = result.data.map(article => {
          const pubDate = article.publishedAt ? new Date(article.publishedAt).toUTCString() : new Date().toUTCString();
          const link = `${c.req.url.split('/api')[0]}/articles/${article.slug}`;
          
          return `
    <item>
      <title><![CDATA[${article.title}]]></title>
      <description><![CDATA[${article.excerpt || ''}]]></description>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      ${article.featuredImage ? `<enclosure url="${article.featuredImage}" type="image/jpeg" />` : ''}
      <category>${article.categoryId || 'Geral'}</category>
      ${article.tags ? article.tags.map((tag: string) => `<category>${tag}</category>`).join('') : ''}
    </item>`;
        }).join('');

        const rssFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Portal de Notícias</title>
    <description>Últimas notícias e artigos</description>
    <link>${c.req.url.split('/api')[0]}</link>
    <language>pt-BR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${c.req.url}" rel="self" type="application/rss+xml" />
    ${rssItems}
  </channel>
</rss>`;

        c.header('Content-Type', 'application/rss+xml; charset=utf-8');
        return c.text(rssFeed);

      } catch (error) {
        console.error('❌ Error generating RSS feed:', error);
        return c.json({
          success: false,
          error: 'Failed to generate RSS feed',
        }, 500);
      }
    });

    // Get RSS feed for specific category
    this.app.get('/rss/category/:slug', zValidator('param', categorySchema), async (c) => {
      try {
        const { slug } = c.req.valid('param');
        console.log('📡 Public API: Generating RSS feed for category:', slug);

        // Find category by slug
        const category = await this.categoryRepository.findBySlug(slug);
        if (!category) {
          return c.json({
            success: false,
            error: 'Category not found',
          }, 404);
        }

        const result = await this.articleRepository.list({
          page: 1,
          limit: 50,
          sortBy: 'publishedAt',
          sortOrder: 'desc',
          filters: {
            status: 'published',
            categoryId: category.id,
          },
        });

        const rssItems = result.data.map(article => {
          const pubDate = article.publishedAt ? new Date(article.publishedAt).toUTCString() : new Date().toUTCString();
          const link = `${c.req.url.split('/api')[0]}/articles/${article.slug}`;
          
          return `
    <item>
      <title><![CDATA[${article.title}]]></title>
      <description><![CDATA[${article.excerpt || ''}]]></description>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      ${article.featuredImage ? `<enclosure url="${article.featuredImage}" type="image/jpeg" />` : ''}
      <category>${category.name}</category>
      ${article.tags ? article.tags.map((tag: string) => `<category>${tag}</category>`).join('') : ''}
    </item>`;
        }).join('');

        const rssFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${category.name} - Portal de Notícias</title>
    <description>${category.description || `Últimas notícias sobre ${category.name}`}</description>
    <link>${c.req.url.split('/api')[0]}/categoria/${slug}</link>
    <language>pt-BR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${c.req.url}" rel="self" type="application/rss+xml" />
    ${rssItems}
  </channel>
</rss>`;

        c.header('Content-Type', 'application/rss+xml; charset=utf-8');
        return c.text(rssFeed);

      } catch (error) {
        console.error('❌ Error generating category RSS feed:', error);
        return c.json({
          success: false,
          error: 'Failed to generate category RSS feed',
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