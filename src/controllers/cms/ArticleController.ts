import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ArticleRepository } from '../../repositories';
import { NewArticle } from '../../config/db/schema';
import { generateId } from '../../lib/cuid';

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
  search: z.string().optional(),
  includeRelations: z.string().transform(val => val === 'true').default('false'),
});

export class ArticleController {
  private app: Hono;
  private articleRepository: ArticleRepository;

  constructor(articleRepository: ArticleRepository) {
    this.app = new Hono();
    this.articleRepository = articleRepository;
    this.setupRoutes();
  }

  private setupRoutes() {
    // Create article
    this.app.post('/', zValidator('json', createArticleSchema), async (c) => {
      try {
        const data = c.req.valid('json');
        
        // Generate slug if not provided
        if (!data.slug) {
          data.slug = this.generateSlug(data.title);
        }

        // Parse dates
        const articleData: NewArticle = {
          ...data,
          id: generateId(),
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
        console.error('Error creating article:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create article',
        }, 400);
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
        console.error('Error fetching article:', error);
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

        // Parse dates if provided
        const updateData: Partial<NewArticle> = {
          ...data,
        };

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
        console.error('Error updating article:', error);
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
        console.error('Error deleting article:', error);
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
        console.error('Error listing articles:', error);
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
        console.error('Error fetching featured articles:', error);
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
        console.error('Error featuring article:', error);
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
        console.error('Error unfeaturing article:', error);
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
        console.error('Error incrementing views:', error);
        return c.json({
          success: false,
          error: 'Failed to increment views',
        }, 500);
      }
    });

    // Get articles count by status
    this.app.get('/stats/status-count', async (c) => {
      try {
        const statusCounts = await this.articleRepository.getCountByStatus();

        return c.json({
          success: true,
          data: statusCounts,
        });
      } catch (error) {
        console.error('Error fetching status counts:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch status counts',
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

        // Verificar se o usuário tem permissão para publicar
        if (!['admin', 'editor-chefe', 'editor', 'developer'].includes(user.role)) {
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
        console.error('Error publishing article:', error);
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

        // Verificar se o usuário tem permissão para despublicar
        if (!['admin', 'editor-chefe', 'editor', 'developer'].includes(user.role)) {
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
        console.error('Error unpublishing article:', error);
        return c.json({
          success: false,
          error: 'Erro interno ao despublicar artigo',
        }, 500);
      }
    });
  }

  /**
   * Generate slug from title
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .trim()
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Remove multiple consecutive hyphens
      .substring(0, 100); // Limit length
  }

  /**
   * Get the Hono app
   */
  getApp() {
    return this.app;
  }
}