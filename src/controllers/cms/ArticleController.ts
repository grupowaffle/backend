import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ArticleRepository } from '../../repositories';
import { NewArticle } from '../../config/db/schema';
import { generateId } from '../../lib/cuid';
import { AuthorSyncService } from '../../services/AuthorSyncService';
import { getDrizzleClient } from '../../config/db';
import { ISlugService, SlugService } from '../core/ISlugService';
import { IExportService, ArticleExportService } from '../core/IExportService';
import { IAuthorizationService, ArticleAuthorizationService } from '../core/IAuthorizationService';

// Validation schemas
const createArticleSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  slug: z.string().min(1, 'Slug is required').optional(),
  content: z.any().optional(),
  excerpt: z.string().optional(),
  status: z.enum(['beehiiv_pending', 'draft', 'review', 'approved', 'published', 'scheduled', 'archived', 'rejected']).default('draft'),
  publishedAt: z.string().datetime().optional().nullable(),
  scheduledFor: z.string().datetime().optional().nullable(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  seoKeywords: z.array(z.string()).optional(),
  categoryId: z.string().optional(),
  newsletter: z.string().optional(),
  tags: z.array(z.string()).optional(),
  authorId: z.string().optional(),
  featuredImageId: z.string().optional(),
  isFeatured: z.boolean().default(false),
  featuredPosition: z.number().optional(),
  featuredUntil: z.string().datetime().optional().nullable(),
  featuredCategory: z.string().optional(),
});

const updateArticleSchema = createArticleSchema.partial();

const listArticlesSchema = z.object({
  page: z.string().transform(val => parseInt(val) || 1).default('1'),
  limit: z.string().transform(val => Math.min(100, parseInt(val) || 20)).default('20'),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  status: z.string().optional(),
  categoryId: z.string().optional(),
  authorId: z.string().optional(),
  source: z.enum(['manual', 'beehiiv']).optional(),
  newsletter: z.string().optional(),
  isFeatured: z.string().transform(val => val === 'true').optional(),
  featuredPosition: z.string().transform(val => parseInt(val)).optional(),
  featuredCategory: z.string().optional(),
  search: z.string().optional(),
  includeRelations: z.string().transform(val => val === 'true').default('false'),
});

/**
 * Article Controller following SOLID principles:
 * - Single Responsibility: Only handles HTTP routing and request/response
 * - Dependency Inversion: Depends on abstractions (interfaces)
 * - Open/Closed: Open for extension through composition
 */
export class ArticleController {
  private app: Hono;
  private articleRepository: ArticleRepository;
  private authorSyncService: AuthorSyncService;
  private slugService: ISlugService;
  private exportService: IExportService;
  private authorizationService: IAuthorizationService;

  constructor(
    articleRepository: ArticleRepository,
    env: any,
    slugService?: ISlugService,
    exportService?: IExportService,
    authorizationService?: IAuthorizationService
  ) {
    this.app = new Hono();
    this.articleRepository = articleRepository;
    const db = getDrizzleClient(env);
    this.authorSyncService = new AuthorSyncService(db);
    this.slugService = slugService || new SlugService();
    this.exportService = exportService || new ArticleExportService();
    this.authorizationService = authorizationService || new ArticleAuthorizationService();
    this.setupRoutes();
  }

  private setupRoutes() {
    // Debug endpoint (temporary - remove in production)
    this.app.get('/debug', async (c) => {
      try {
        const result = await this.articleRepository.list({
          page: 1,
          limit: 100,
          filters: {},
          includeRelations: false,
        });

        const bySource = result.data.reduce((acc, item) => {
          const source = item.source || 'manual';
          acc[source] = (acc[source] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        return c.json({
          success: true,
          data: {
            total: result.pagination.total,
            bySource,
            articles: result.data.map(article => ({
              id: article.id,
              title: article.title,
              source: article.source || 'manual',
              status: article.status,
              createdAt: article.createdAt
            }))
          },
        });
      } catch (error) {
        // Error in debug endpoint
        return c.json({
          success: false,
          error: 'Failed to fetch debug data',
        }, 500);
      }
    });

    // Get complete article statistics (DEVE VIR ANTES DA ROTA /:id)
    this.app.get('/stats', async (c) => {
      try {
        const stats = await this.articleRepository.getCompleteStats();

        return c.json({
          success: true,
          data: stats,
        });
      } catch (error) {
        // Error fetching article stats
        return c.json({
          success: false,
          error: 'Failed to fetch article stats',
        }, 500);
      }
    });

    // Get articles count by status (DEVE VIR ANTES DA ROTA /:id)
    this.app.get('/stats/status-count', async (c) => {
      try {
        const statusCounts = await this.articleRepository.getCountByStatus();

        return c.json({
          success: true,
          data: statusCounts,
        });
      } catch (error) {
        // Error fetching status counts
        return c.json({
          success: false,
          error: 'Failed to fetch status counts',
        }, 500);
      }
    });

    // Create article
    this.app.post('/', zValidator('json', createArticleSchema), async (c) => {
      try {
        const data = c.req.valid('json');
        const user = c.get('user');

        // Generate slug if not provided (delegates to SlugService)
        if (!data.slug) {
          data.slug = this.slugService.generateSlug(data.title);
        }

        // Ensure author exists for the current user
        let authorId = data.authorId;
        if (!authorId && user?.id) {
          authorId = await this.authorSyncService.getAuthorIdForUser(user.id.toString());
        }

        // Parse dates
        const articleData: NewArticle = {
          ...data,
          id: generateId(),
          authorId: authorId || null,
          editorId: user?.id?.toString() || null,
          publishedAt: data.publishedAt ? new Date(data.publishedAt) : null,
          scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
          featuredUntil: data.featuredUntil ? new Date(data.featuredUntil) : null,
          source: 'manual', // Always manual for this endpoint
        };

        const article = await this.articleRepository.create(articleData);

        return c.json({
          success: true,
          data: article,
        }, 201);
      } catch (error) {
        // Error creating article
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create article',
        }, 400);
      }
    });

    // Export articles (DEVE VIR ANTES DA ROTA /:id)
    this.app.get('/export', zValidator('query', listArticlesSchema.extend({
      format: z.enum(['csv', 'xlsx', 'pdf']).default('csv'),
    })), async (c) => {
      try {
        const params = c.req.valid('query');

        const filters = {
          status: params.status,
          categoryId: params.categoryId,
          authorId: params.authorId,
          source: params.source,
          newsletter: params.newsletter,
          isFeatured: params.isFeatured,
          featuredPosition: params.featuredPosition,
          featuredCategory: params.featuredCategory,
          search: params.search,
        };

        // Remove undefined values
        Object.keys(filters).forEach(key => {
          if (filters[key as keyof typeof filters] === undefined) {
            delete filters[key as keyof typeof filters];
          }
        });

        // Get all articles for export (no pagination)
        const result = await this.articleRepository.list({
          page: 1,
          limit: 10000, // Large limit to get all articles
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
          filters,
          includeRelations: true, // Include relations for better export data
        });

        // Generate export content based on format (delegates to ExportService)
        if (params.format === 'csv') {
          const csvContent = this.exportService.generateCSV(result.data);

          return new Response(csvContent, {
            headers: {
              'Content-Type': 'text/csv;charset=utf-8',
              'Content-Disposition': `attachment; filename="artigos-${new Date().toISOString().split('T')[0]}.csv"`,
            },
          });
        } else {
          // For now, default to CSV for other formats
          const csvContent = this.exportService.generateCSV(result.data);

          return new Response(csvContent, {
            headers: {
              'Content-Type': 'text/csv;charset=utf-8',
              'Content-Disposition': `attachment; filename="artigos-${new Date().toISOString().split('T')[0]}.csv"`,
            },
          });
        }
      } catch (error) {
        // Error exporting articles
        return c.json({
          success: false,
          error: 'Failed to export articles',
        }, 500);
      }
    });

    // Get article by ID
    this.app.get('/:id', async (c) => {
      try {
        const id = c.req.param('id');
        const includeRelations = c.req.query('includeRelations') === 'true';

        const article = await this.articleRepository.findById(id, includeRelations);

        if (!article) {
          return c.json({
            success: false,
            error: 'Article not found',
          }, 404);
        }

        return c.json({
          success: true,
          data: article,
        });
      } catch (error) {
        // Error fetching article
        return c.json({
          success: false,
          error: 'Failed to fetch article',
        }, 500);
      }
    });

    // Update article
    this.app.put('/:id', zValidator('json', updateArticleSchema), async (c) => {
      try {
        const id = c.req.param('id');
        const data = c.req.valid('json');
        const user = c.get('user');

        // Ensure author exists for the current user if no authorId provided
        let authorId = data.authorId;
        if (!authorId && user?.id) {
          authorId = await this.authorSyncService.getAuthorIdForUser(user.id.toString());
        }

        // Parse dates if provided
        const updateData: Partial<NewArticle> = {
          ...data,
          authorId: authorId || data.authorId, // Use the ensured author ID
          editorId: user?.id?.toString() || null, // Track who edited
        };

        console.log('🎯 Controller - received data.tags:', data.tags);
        console.log('🎯 Controller - updateData.tags:', updateData.tags);

        if (data.publishedAt) {
          updateData.publishedAt = new Date(data.publishedAt);
        }
        if (data.scheduledFor) {
          updateData.scheduledFor = new Date(data.scheduledFor);
        }
        if (data.featuredUntil) {
          updateData.featuredUntil = new Date(data.featuredUntil);
        }

        const article = await this.articleRepository.update(id, updateData);

        if (!article) {
          return c.json({
            success: false,
            error: 'Article not found',
          }, 404);
        }

        return c.json({
          success: true,
          data: article,
        });
      } catch (error) {
        // Error updating article
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update article',
        }, 400);
      }
    });

    // Delete article
    this.app.delete('/:id', async (c) => {
      try {
        const id = c.req.param('id');

        const success = await this.articleRepository.delete(id);

        if (!success) {
          return c.json({
            success: false,
            error: 'Article not found',
          }, 404);
        }

        return c.json({
          success: true,
          message: 'Article deleted successfully',
        });
      } catch (error) {
        // Error deleting article
        return c.json({
          success: false,
          error: 'Failed to delete article',
        }, 500);
      }
    });

    // List articles
    this.app.get('/', zValidator('query', listArticlesSchema), async (c) => {
      try {
        const params = c.req.valid('query');

        const filters = {
          status: params.status,
          categoryId: params.categoryId,
          authorId: params.authorId,
          source: params.source,
          newsletter: params.newsletter,
          isFeatured: params.isFeatured,
          featuredPosition: params.featuredPosition,
          featuredCategory: params.featuredCategory,
          search: params.search,
        };

        // Remove undefined values
        Object.keys(filters).forEach(key => {
          if (filters[key as keyof typeof filters] === undefined) {
            delete filters[key as keyof typeof filters];
          }
        });

        const result = await this.articleRepository.list({
          page: params.page,
          limit: params.limit,
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
          filters,
          includeRelations: params.includeRelations,
        });

        return c.json({
          success: true,
          data: result.data,
          pagination: result.pagination,
        });
      } catch (error) {
        // Error listing articles
        return c.json({
          success: false,
          error: 'Failed to list articles',
        }, 500);
      }
    });

    // Get featured articles
    this.app.get('/featured/:category?', async (c) => {
      try {
        const category = c.req.param('category');

        const articles = await this.articleRepository.listFeatured(category);

        return c.json({
          success: true,
          data: articles,
        });
      } catch (error) {
        // Error fetching featured articles
        return c.json({
          success: false,
          error: 'Failed to fetch featured articles',
        }, 500);
      }
    });

    // Mark article as featured
    this.app.post('/:id/feature', async (c) => {
      try {
        const id = c.req.param('id');
        const {
          featuredCategory,
          featuredPosition,
          featuredUntil
        } = await c.req.json();

        const updateData = {
          isFeatured: true,
          featuredCategory,
          featuredPosition,
          featuredUntil: featuredUntil ? new Date(featuredUntil) : null,
          featuredAt: new Date(),
          // TODO: Add featuredBy when we have auth context
        };

        const article = await this.articleRepository.update(id, updateData);

        if (!article) {
          return c.json({
            success: false,
            error: 'Article not found',
          }, 404);
        }

        return c.json({
          success: true,
          data: article,
        });
      } catch (error) {
        // Error featuring article
        return c.json({
          success: false,
          error: 'Failed to feature article',
        }, 500);
      }
    });

    // Remove article from featured
    this.app.delete('/:id/feature', async (c) => {
      try {
        const id = c.req.param('id');

        const article = await this.articleRepository.update(id, {
          isFeatured: false,
          featuredPosition: null,
          featuredCategory: null,
          featuredUntil: null,
          featuredAt: null,
        });

        if (!article) {
          return c.json({
            success: false,
            error: 'Article not found',
          }, 404);
        }

        return c.json({
          success: true,
          data: article,
        });
      } catch (error) {
        // Error unfeaturing article
        return c.json({
          success: false,
          error: 'Failed to unfeature article',
        }, 500);
      }
    });

    // Increment views (for public API)
    this.app.post('/:id/view', async (c) => {
      try {
        const id = c.req.param('id');

        await this.articleRepository.incrementViews(id);

        return c.json({
          success: true,
          message: 'View incremented',
        });
      } catch (error) {
        // Error incrementing views
        return c.json({
          success: false,
          error: 'Failed to increment views',
        }, 500);
      }
    });


    // Publish article
    this.app.patch('/:id/publish', async (c) => {
      try {
        const id = c.req.param('id');
        const user = c.get('user');
        
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Verificar se o usuário tem permissão para publicar (delegates to AuthorizationService)
        if (!this.authorizationService.canPublish(user.role)) {
          return c.json({
            success: false,
            error: 'Permissão insuficiente para publicar artigos',
          }, 403);
        }

        // Buscar o artigo
        const article = await this.articleRepository.findById(id, true);
        if (!article) {
          return c.json({
            success: false,
            error: 'Artigo não encontrado',
          }, 404);
        }

        // Verificar se o artigo pode ser publicado
        if (article.status === 'published') {
          return c.json({
            success: false,
            error: 'Artigo já está publicado',
          }, 400);
        }

        if (article.status === 'archived') {
          return c.json({
            success: false,
            error: 'Não é possível publicar um artigo arquivado',
          }, 400);
        }

        // Atualizar o artigo para publicado
        const updatedArticle = await this.articleRepository.update(id, {
          status: 'published',
          publishedAt: new Date(),
          updatedAt: new Date(),
        });

        if (!updatedArticle) {
          return c.json({
            success: false,
            error: 'Erro ao publicar artigo',
          }, 500);
        }

        return c.json({
          success: true,
          data: updatedArticle,
          message: 'Artigo publicado com sucesso',
        });

      } catch (error) {
        // Error publishing article
        return c.json({
          success: false,
          error: 'Erro interno ao publicar artigo',
        }, 500);
      }
    });

    // Unpublish article
    this.app.patch('/:id/unpublish', async (c) => {
      try {
        const id = c.req.param('id');
        const user = c.get('user');
        
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Verificar se o usuário tem permissão para despublicar (delegates to AuthorizationService)
        if (!this.authorizationService.canUnpublish(user.role)) {
          return c.json({
            success: false,
            error: 'Permissão insuficiente para despublicar artigos',
          }, 403);
        }

        // Buscar o artigo
        const article = await this.articleRepository.findById(id, true);
        if (!article) {
          return c.json({
            success: false,
            error: 'Artigo não encontrado',
          }, 404);
        }

        // Verificar se o artigo pode ser despublicado
        if (article.status !== 'published') {
          return c.json({
            success: false,
            error: 'Apenas artigos publicados podem ser despublicados',
          }, 400);
        }

        // Atualizar o artigo para rascunho
        const updatedArticle = await this.articleRepository.update(id, {
          status: 'draft',
          publishedAt: null,
          updatedAt: new Date(),
        });

        if (!updatedArticle) {
          return c.json({
            success: false,
            error: 'Erro ao despublicar artigo',
          }, 500);
        }

        return c.json({
          success: true,
          data: updatedArticle,
          message: 'Artigo despublicado com sucesso',
        });

      } catch (error) {
        // Error unpublishing article
        return c.json({
          success: false,
          error: 'Erro interno ao despublicar artigo',
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