import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDrizzleClient } from '../../config/db';
import { ArticleRepository, CategoryRepository, AuthorRepository, TagRepository } from '../../repositories';
import { authors } from '../../config/db/schema';
import { EngagementTrackingService } from '../../services/EngagementTrackingService';
import { Env } from '../../config/types/common';
import { eq, desc, and } from 'drizzle-orm';

// Validation schemas for public API
const listArticlesSchema = z.object({
  page: z.string().transform(val => parseInt(val) || 1).default(1),
  limit: z.string().transform(val => Math.min(50, parseInt(val) || 20)).default(20),
  category: z.string().optional(),
  author: z.string().optional(),
  tags: z.string().optional(), // Comma-separated tags
  date: z.string().optional(), // YYYY-MM-DD format
  featured: z.string().transform(val => val === 'true').optional(),
  source: z.enum(['manual', 'beehiiv']).optional(),
  newsletter: z.string().optional(), // Filtro por caderno/newsletter
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
  page: z.string().transform(val => parseInt(val) || 1).default(1),
  limit: z.string().transform(val => Math.min(50, parseInt(val) || 20)).default(20),
  search: z.string().optional(),
  featured: z.string().transform(val => val === 'true').optional(),
  sort: z.enum(['name', 'articleCount', 'createdAt']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

const listTagsSchema = z.object({
  page: z.string().transform(val => parseInt(val) || 1).default(1),
  limit: z.string().transform(val => Math.min(50, parseInt(val) || 20)).default(20),
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
        const { page, limit, category, author, tags, date, featured, source, newsletter, sort, order, search } = c.req.valid('query');

        console.log('📰 Public API: Fetching articles with filters:', { 
          page, limit, category, author, tags, date, featured, source, newsletter, sort, order, search 
        });

        // Build filters for published articles only
        const filters: any = {
          status: 'published',
        };

        if (category) {
          // First, try to find category by slug to get the ID
          const categoryData = await this.categoryRepository.findBySlug(category);
          if (categoryData) {
            filters.categoryId = categoryData.id;
          } else {
            // If not found by slug, assume it's already an ID
            filters.categoryId = category;
          }
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

        if (newsletter) {
          filters.newsletter = newsletter;
        }

        const options = {
          page,
          limit,
          sortBy: sort,
          sortOrder: order as 'asc' | 'desc',
          filters,
          search,
        };

        const result = await this.articleRepository.list({
          ...options,
          includeRelations: true, // Include category and author data
        });

        // Transform articles with enhanced data for portal
        const publicArticles = await Promise.all(result.data.map(async (item) => {
          const baseUrl = this.env.PORTAL_BASE_URL || 'https://portal.com';
          
          // Handle both structures: with relations and without
          const article = item.article || item;
          const category = item.category;
          const author = article.authorId ? await this.getUserAsAuthor(article.authorId) : null;
          const featuredMedia = item.featuredMedia;
          
          return {
            id: article.id,
            title: article.title,
            subtitle: article.subtitle,
            slug: article.slug,
            excerpt: article.excerpt,
            content: article.content,
            publishedAt: article.publishedAt,
            updatedAt: article.updatedAt,
            readTime: article.readTime,
            views: article.views || 0,
            likes: article.likes || 0,
            shares: article.shares || 0,
            isFeatured: article.isFeatured,
            source: article.source,
            newsletter: article.newsletter, // Campo caderno/newsletter
            
            // URLs completas para navegação
            url: `/artigo/${article.slug}`,
            canonicalUrl: `${baseUrl}/artigo/${article.slug}`,
            
            // Dados de categoria completos
            category: category ? {
              id: category.id,
              name: category.name,
              slug: category.slug,
              description: category.description,
              color: category.color,
              icon: category.icon,
              url: `/categoria/${category.slug}`,
              categoryUrl: `${baseUrl}/categoria/${category.slug}`,
            } : null,
            
            // Dados de autor completos
            author: author ? {
              id: author.id,
              name: author.name,
              email: author.email,
              avatar: author.avatar,
              bio: author.bio,
              url: `/autor/${author.slug || author.id}`,
              authorUrl: `${baseUrl}/autor/${author.slug || author.id}`,
            } : null,
            
            // Imagem otimizada com metadados
            featuredImage: featuredMedia ? {
              url: featuredMedia.url,
              alt: featuredMedia.alt || article.title,
              width: featuredMedia.width,
              height: featuredMedia.height,
              caption: featuredMedia.caption,
              thumbnail: featuredMedia.thumbnail,
            } : this.extractFeaturedImageFromContent(article.content, article.title),
            
            // SEO otimizado
            seo: {
              title: article.seoTitle || article.title,
              description: article.seoDescription || article.excerpt,
              keywords: article.seoKeywords || article.tags || [],
              canonicalUrl: `${baseUrl}/artigo/${article.slug}`,
            },
            
            // Tags
            tags: article.tags || [],
            
            // Estatísticas
            stats: {
              views: article.views || 0,
              likes: article.likes || 0,
              shares: article.shares || 0,
              comments: 0, // TODO: Implementar contagem de comentários
            },
            
            // Metadados adicionais
            wordCount: this.calculateWordCount(article.content),
            readingTime: this.calculateReadingTime(article.content),
            publishedDate: article.publishedAt ? new Date(article.publishedAt).toLocaleDateString('pt-BR') : null,
            publishedTimeAgo: article.publishedAt ? this.getTimeAgo(article.publishedAt) : null,
          };
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
          includeRelations: true, // Include category and author data
        });

        const baseUrl = this.env.PORTAL_BASE_URL || 'https://portal.com';

        const featuredArticles = result.data.map(item => {
          // Handle both structures: with relations and without
          const article = item.article || item;
          const category = item.category;
          const author = item.author;
          const featuredMedia = item.featuredMedia;
          
          return {
            id: article.id,
            title: article.title,
            subtitle: article.subtitle,
            slug: article.slug,
            excerpt: article.excerpt,
            publishedAt: article.publishedAt,
            readTime: article.readTime,
            views: article.views || 0,
            source: article.source,
            newsletter: article.newsletter, // Campo caderno/newsletter
            
            // URLs completas
            url: `/artigo/${article.slug}`,
            canonicalUrl: `${baseUrl}/artigo/${article.slug}`,
            
            // Dados de categoria
            category: category ? {
              id: category.id,
              name: category.name,
              slug: category.slug,
              color: category.color,
              icon: category.icon,
              url: `/categoria/${category.slug}`,
            } : null,
            
            // Dados de autor
            author: author ? {
              id: author.id,
              name: author.name,
              avatar: author.avatar,
              url: `/autor/${author.slug || author.id}`,
            } : null,
            
            // Imagem otimizada
            featuredImage: featuredMedia ? {
              url: featuredMedia.url,
              alt: featuredMedia.alt || article.title,
              width: featuredMedia.width,
              height: featuredMedia.height,
            } : null,
            
            // Metadados adicionais
            wordCount: this.calculateWordCount(article.content),
            readingTime: this.calculateReadingTime(article.content),
            publishedTimeAgo: article.publishedAt ? this.getTimeAgo(article.publishedAt) : null,
          };
        });

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

        // Get related data for enhanced response
        const [category, author, featuredMedia] = await Promise.all([
          article.categoryId ? this.categoryRepository.findById(article.categoryId) : null,
          article.authorId ? this.getUserAsAuthor(article.authorId) : null,
          article.featuredImageId ? this.articleRepository.getMediaById(article.featuredImageId) : null,
        ]);

        const baseUrl = this.env.PORTAL_BASE_URL || 'https://portal.com';

        // Return enhanced public article data
        const publicArticle = {
          id: article.id,
          title: article.title,
          subtitle: article.subtitle,
          slug: article.slug,
          excerpt: article.excerpt,
          content: article.content,
          publishedAt: article.publishedAt,
          updatedAt: article.updatedAt,
          readTime: article.readTime,
          views: (article.views || 0) + 1, // Include the incremented view
          likes: article.likes || 0,
          shares: article.shares || 0,
          isFeatured: article.isFeatured,
          source: article.source,
          newsletter: article.newsletter, // Campo caderno/newsletter
          beehiivUrl: article.beehiivUrl,
          
          // URLs completas para navegação
          url: `/artigo/${article.slug}`,
          canonicalUrl: `${baseUrl}/artigo/${article.slug}`,
          
          // Dados de categoria completos
          category: category ? {
            id: category.id,
            name: category.name,
            slug: category.slug,
            description: category.description,
            color: category.color,
            icon: category.icon,
            url: `/categoria/${category.slug}`,
            categoryUrl: `${baseUrl}/categoria/${category.slug}`,
          } : null,
          
          // Dados de autor completos
          author: author ? {
            id: author.id,
            name: author.name,
            email: author.email,
            avatar: author.avatar,
            bio: author.bio,
            url: `/autor/${author.slug || author.id}`,
            authorUrl: `${baseUrl}/autor/${author.slug || author.id}`,
          } : null,
          
          // Imagem otimizada com metadados
          featuredImage: featuredMedia ? {
            url: featuredMedia.url,
            alt: featuredMedia.alt || article.title,
            width: featuredMedia.width,
            height: featuredMedia.height,
            caption: featuredMedia.caption,
            thumbnail: featuredMedia.thumbnail,
          } : this.extractFeaturedImageFromContent(article.content, article.title),
          
          // SEO otimizado
          seo: {
            title: article.seoTitle || article.title,
            description: article.seoDescription || article.excerpt,
            keywords: article.seoKeywords || article.tags || [],
            canonicalUrl: `${baseUrl}/artigo/${article.slug}`,
          },
          
          // Tags
          tags: article.tags || [],
          
          // Estatísticas
          stats: {
            views: (article.views || 0) + 1,
            likes: article.likes || 0,
            shares: article.shares || 0,
            comments: 0, // TODO: Implementar contagem de comentários
          },
          
          // Metadados adicionais
          wordCount: this.calculateWordCount(article.content),
          readingTime: this.calculateReadingTime(article.content),
          publishedDate: article.publishedAt ? new Date(article.publishedAt).toLocaleDateString('pt-BR') : null,
          publishedTimeAgo: article.publishedAt ? this.getTimeAgo(article.publishedAt) : null,
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
          newsletter: relatedArticle.newsletter, // Campo caderno/newsletter
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
          newsletter: article.newsletter, // Campo caderno/newsletter
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
  page: z.string().transform(val => parseInt(val) || 1).default(1),
  limit: z.string().transform(val => Math.min(50, parseInt(val) || 20)).default(20),
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
          newsletter: article.newsletter, // Campo caderno/newsletter
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

    // Debug endpoint para verificar autores
    this.app.get('/debug/authors', async (c) => {
      try {
        const { getDrizzleClient } = await import('../../config/db');
        const db = getDrizzleClient(c.env);
        const { authors, articles } = await import('../../config/db/schema');
        const { eq } = await import('drizzle-orm');
        
        // Buscar todos os autores
        const allAuthors = await db
          .select()
          .from(authors)
          .limit(10);

        // Buscar artigos com autores
        const articlesWithAuthors = await db
          .select({
            articleId: articles.id,
            articleTitle: articles.title,
            authorId: articles.authorId,
            authorName: authors.name,
          })
          .from(articles)
          .leftJoin(authors, eq(articles.authorId, authors.id))
          .limit(10);

        return c.json({
          success: true,
          data: {
            allAuthors,
            articlesWithAuthors,
          },
        });
      } catch (error) {
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch debug info',
        }, 500);
      }
    });

    // Debug endpoint removed - using D1 for user management

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
        console.log('🔍 Author found:', author ? { id: author.id, name: author.name, slug: author.slug, isActive: author.isActive } : 'null');
        
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
          newsletter: article.newsletter, // Campo caderno/newsletter
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
          newsletter: article.newsletter, // Campo caderno/newsletter
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
      ${article.newsletter ? `<category>${article.newsletter}</category>` : ''}
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
      ${article.newsletter ? `<category>${article.newsletter}</category>` : ''}
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
   * Calculate word count from HTML content
   */
  private calculateWordCount(content: any): number {
    if (!content) return 0;
    
    // Handle both string and array content
    let contentString = '';
    if (typeof content === 'string') {
      contentString = content;
    } else if (Array.isArray(content)) {
      // If content is an array, join all text content
      contentString = content.map(item => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item.text) return item.text;
        return '';
      }).join(' ');
    } else if (typeof content === 'object' && content.text) {
      contentString = content.text;
    } else {
      return 0;
    }
    
    // Remove HTML tags and get plain text
    const plainText = contentString.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Count words (split by spaces and filter empty strings)
    const words = plainText.split(' ').filter(word => word.length > 0);
    return words.length;
  }

  /**
   * Calculate reading time in minutes
   */
  private calculateReadingTime(content: any): string {
    const wordCount = this.calculateWordCount(content);
    const wordsPerMinute = 200; // Average reading speed
    const minutes = Math.ceil(wordCount / wordsPerMinute);
    
    if (minutes === 1) return '1 min';
    return `${minutes} min`;
  }

  /**
   * Get time ago string in Portuguese
   */
  private getTimeAgo(dateString: string): string {
    const now = new Date();
    const date = new Date(dateString);
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'há poucos segundos';
    if (diffInSeconds < 3600) return `há ${Math.floor(diffInSeconds / 60)} min`;
    if (diffInSeconds < 86400) return `há ${Math.floor(diffInSeconds / 3600)}h`;
    if (diffInSeconds < 2592000) return `há ${Math.floor(diffInSeconds / 86400)} dias`;
    if (diffInSeconds < 31536000) return `há ${Math.floor(diffInSeconds / 2592000)} meses`;
    return `há ${Math.floor(diffInSeconds / 31536000)} anos`;
  }

  /**
   * Extract featured image from article content
   */
  private extractFeaturedImageFromContent(content: any, articleTitle: string): any {
    if (!content) return null;

    // Handle both string and array content
    let contentString = '';
    if (typeof content === 'string') {
      contentString = content;
    } else if (Array.isArray(content)) {
      // If content is an array, join all text content
      contentString = content.map(item => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item.text) return item.text;
        return '';
      }).join(' ');
    } else if (typeof content === 'object' && content.text) {
      contentString = content.text;
    } else {
      return null;
    }

    // Regex para encontrar tags <img> no conteúdo
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/i;
    const match = contentString.match(imgRegex);

    if (match && match[1]) {
      const imageUrl = match[1];

      // Verificar se é uma URL válida
      if (imageUrl.startsWith('http') || imageUrl.startsWith('/')) {
        return {
          url: imageUrl,
          alt: articleTitle,
          width: null,
          height: null,
          caption: null,
          thumbnail: null,
          source: 'content' // Indica que foi extraída do conteúdo
        };
      }
    }

    return null;
  }

  /**
   * Get user as author data
   */
  private async getUserAsAuthor(authorId: string): Promise<any> {
    try {
      const db = getDrizzleClient(this.env);

      // First try to get from authors table (preferred)
      const author = await db
        .select()
        .from(authors)
        .where(eq(authors.id, authorId))
        .limit(1);

      if (author[0]) {
        return {
          id: author[0].id,
          name: author[0].name,
          email: author[0].email,
          avatar: author[0].avatar,
          bio: author[0].bio,
          slug: author[0].slug,
        };
      }

      // Fallback: return null since users table is in D1
      return null;
    } catch (error) {
      console.error('Error fetching author:', error);
      return null;
    }
  }

  /**
   * Get the Hono app
   */
  getApp() {
    return this.app;
  }
}