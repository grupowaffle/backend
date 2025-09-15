import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { FeaturedContentService, FeaturedType, FeaturedPosition } from '../../services/FeaturedContentService';
import { getDrizzleClient } from '../../config/db';
import { Env } from '../../config/types/common';
import { authMiddleware } from '../../middlewares/auth';

// Validation schemas
const addFeaturedSchema = z.object({
  articleId: z.string().min(1, 'Article ID é obrigatório'),
  featuredType: z.enum([
    'hero_main', 'hero_secondary', 'trending_now', 'editors_pick',
    'category_featured', 'breaking_news', 'most_read', 'recommended', 'spotlight'
  ]),
  position: z.enum([
    'homepage_main', 'homepage_secondary', 'homepage_sidebar',
    'category_header', 'category_sidebar', 'article_related',
    'newsletter_featured', 'mobile_featured', 'search_featured'
  ]),
  priority: z.number().int().min(0).optional(),
  categoryId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  customTitle: z.string().max(200).optional(),
  customDescription: z.string().max(500).optional(),
  customImageUrl: z.string().url().optional(),
  metadata: z.record(z.any()).optional(),
});

const updateFeaturedSchema = z.object({
  priority: z.number().int().min(0).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
  customTitle: z.string().max(200).optional(),
  customDescription: z.string().max(500).optional(),
  customImageUrl: z.string().url().optional(),
  metadata: z.record(z.any()).optional(),
});

const listFeaturedSchema = z.object({
  featuredType: z.string().optional(),
  position: z.string().optional(),
  categoryId: z.string().optional(),
  isActive: z.boolean().optional(),
  includeExpired: z.boolean().optional().default(false),
  page: z.string().transform(val => Math.max(1, parseInt(val) || 1)).default('1'),
  limit: z.string().transform(val => Math.min(100, Math.max(1, parseInt(val) || 20))).default('20'),
  sortBy: z.enum(['priority', 'createdAt', 'updatedAt', 'views', 'likes']).optional().default('priority'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

const reorderSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    priority: z.number().int().min(0),
  })).min(1),
});

export class FeaturedContentController {
  private app: Hono;
  private featuredContentService: FeaturedContentService;

  constructor(env: Env) {
    this.app = new Hono();
    const db = getDrizzleClient(env);
    this.featuredContentService = new FeaturedContentService(db);
    this.setupRoutes();
  }

  private setupRoutes() {
    // Middleware de autenticação para todas as rotas
    this.app.use('*', authMiddleware);

    // Listar conteúdo featured
    this.app.get('/', zValidator('query', listFeaturedSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const {
          featuredType,
          position,
          categoryId,
          isActive,
          includeExpired,
          page,
          limit,
          sortBy,
          sortOrder,
        } = c.req.valid('query');

        console.log(`📋 Listing featured content for user ${user.name}`);

        const offset = (page - 1) * limit;

        // Parse multiple types/positions
        const parsedTypes = featuredType ? featuredType.split(',').filter(t => t) as FeaturedType[] : undefined;
        const parsedPositions = position ? position.split(',').filter(p => p) as FeaturedPosition[] : undefined;

        const result = await this.featuredContentService.listFeaturedContent({
          featuredType: parsedTypes && parsedTypes.length > 0 ? parsedTypes : undefined,
          position: parsedPositions && parsedPositions.length > 0 ? parsedPositions : undefined,
          categoryId,
          isActive,
          includeExpired,
          limit,
          offset,
          sortBy,
          sortOrder,
        });

        return c.json({
          success: true,
          data: result.items,
          pagination: result.pagination,
        });

      } catch (error) {
        console.error('Error listing featured content:', error);
        return c.json({
          success: false,
          error: 'Erro ao listar conteúdo featured',
        }, 500);
      }
    });

    // Adicionar artigo aos destaques
    this.app.post('/', zValidator('json', addFeaturedSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Verificar permissões (apenas editores-chefe e admins podem gerenciar featured)
        if (!['admin', 'editor-chefe'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Apenas administradores e editores-chefe podem gerenciar conteúdo em destaque',
          }, 403);
        }

        const data = c.req.valid('json');

        console.log(`⭐ Adding featured content: ${data.articleId} by ${user.name}`);

        const result = await this.featuredContentService.addFeaturedContent({
          ...data,
          startDate: data.startDate ? new Date(data.startDate) : undefined,
          endDate: data.endDate ? new Date(data.endDate) : undefined,
          createdBy: user.id,
        });

        if (result.success) {
          return c.json({
            success: true,
            message: result.message,
            data: result.featured,
          }, 201);
        } else {
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }

      } catch (error) {
        console.error('Error adding featured content:', error);
        return c.json({
          success: false,
          error: 'Erro ao adicionar conteúdo aos destaques',
        }, 500);
      }
    });

    // Obter featured content por ID
    this.app.get('/:id', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const id = c.req.param('id');

        console.log(`🔍 Getting featured content: ${id}`);

        const featured = await this.featuredContentService.getFeaturedContentById(id);

        if (featured) {
          return c.json({
            success: true,
            data: featured,
          });
        } else {
          return c.json({
            success: false,
            error: 'Conteúdo featured não encontrado',
          }, 404);
        }

      } catch (error) {
        console.error('Error getting featured content:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar conteúdo featured',
        }, 500);
      }
    });

    // Atualizar featured content
    this.app.put('/:id', zValidator('json', updateFeaturedSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Verificar permissões
        if (!['admin', 'editor-chefe'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Apenas administradores e editores-chefe podem gerenciar conteúdo em destaque',
          }, 403);
        }

        const id = c.req.param('id');
        const data = c.req.valid('json');

        console.log(`✏️ Updating featured content: ${id} by ${user.name}`);

        const result = await this.featuredContentService.updateFeaturedContent(id, {
          ...data,
          startDate: data.startDate ? new Date(data.startDate) : undefined,
          endDate: data.endDate ? new Date(data.endDate) : undefined,
          updatedBy: user.id,
        });

        if (result.success) {
          return c.json({
            success: true,
            message: result.message,
            data: result.featured,
          });
        } else {
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }

      } catch (error) {
        console.error('Error updating featured content:', error);
        return c.json({
          success: false,
          error: 'Erro ao atualizar conteúdo featured',
        }, 500);
      }
    });

    // Remover dos destaques
    this.app.delete('/:id', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Verificar permissões
        if (!['admin', 'editor-chefe'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Apenas administradores e editores-chefe podem gerenciar conteúdo em destaque',
          }, 403);
        }

        const id = c.req.param('id');

        console.log(`🗑️ Removing featured content: ${id} by ${user.name}`);

        const result = await this.featuredContentService.removeFeaturedContent(id, user.id);

        if (result.success) {
          return c.json({
            success: true,
            message: result.message,
          });
        } else {
          return c.json({
            success: false,
            error: result.message,
          }, 404);
        }

      } catch (error) {
        console.error('Error removing featured content:', error);
        return c.json({
          success: false,
          error: 'Erro ao remover conteúdo dos destaques',
        }, 500);
      }
    });

    // Reordenar prioridades
    this.app.post('/reorder', zValidator('json', reorderSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Verificar permissões
        if (!['admin', 'editor-chefe'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Apenas administradores e editores-chefe podem reordenar conteúdo',
          }, 403);
        }

        const { items } = c.req.valid('json');

        console.log(`🔄 Reordering ${items.length} featured items by ${user.name}`);

        const result = await this.featuredContentService.reorderFeaturedContent(items, user.id);

        if (result.success) {
          return c.json({
            success: true,
            message: result.message,
          });
        } else {
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }

      } catch (error) {
        console.error('Error reordering featured content:', error);
        return c.json({
          success: false,
          error: 'Erro ao reordenar conteúdo',
        }, 500);
      }
    });

    // Obter estatísticas
    this.app.get('/stats/overview', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        console.log(`📊 Getting featured content stats for ${user.name}`);

        const stats = await this.featuredContentService.getFeaturedContentStats();

        return c.json({
          success: true,
          data: stats,
        });

      } catch (error) {
        console.error('Error getting featured content stats:', error);
        return c.json({
          success: false,
          error: 'Erro ao obter estatísticas',
        }, 500);
      }
    });

    // Limpeza de conteúdo expirado (cron job endpoint)
    this.app.post('/cleanup/expired', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        if (user.role !== 'admin') {
          return c.json({
            success: false,
            error: 'Apenas administradores podem executar limpeza',
          }, 403);
        }

        console.log(`🧹 Cleaning up expired featured content by admin ${user.name}`);

        const result = await this.featuredContentService.cleanupExpiredFeatured();

        return c.json({
          success: true,
          message: `Limpeza concluída: ${result.removed} itens removidos`,
          data: result,
        });

      } catch (error) {
        console.error('Error cleaning up expired featured content:', error);
        return c.json({
          success: false,
          error: 'Erro na limpeza',
        }, 500);
      }
    });

    // Buscar artigos por posição específica (para frontend)
    this.app.get('/by-position/:position', async (c) => {
      try {
        const position = c.req.param('position') as FeaturedPosition;
        const limit = parseInt(c.req.query('limit') || '10');
        const categoryId = c.req.query('categoryId');

        console.log(`📍 Getting featured content for position: ${position}`);

        const result = await this.featuredContentService.listFeaturedContent({
          position: [position],
          categoryId,
          isActive: true,
          includeExpired: false,
          limit,
          sortBy: 'priority',
          sortOrder: 'asc',
        });

        return c.json({
          success: true,
          data: result.items,
          total: result.total,
        });

      } catch (error) {
        console.error('Error getting featured by position:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar conteúdo por posição',
        }, 500);
      }
    });

    // Buscar artigos por tipo específico (para frontend)
    this.app.get('/by-type/:type', async (c) => {
      try {
        const type = c.req.param('type') as FeaturedType;
        const limit = parseInt(c.req.query('limit') || '10');
        const categoryId = c.req.query('categoryId');

        console.log(`📂 Getting featured content for type: ${type}`);

        const result = await this.featuredContentService.listFeaturedContent({
          featuredType: [type],
          categoryId,
          isActive: true,
          includeExpired: false,
          limit,
          sortBy: 'priority',
          sortOrder: 'asc',
        });

        return c.json({
          success: true,
          data: result.items,
          total: result.total,
        });

      } catch (error) {
        console.error('Error getting featured by type:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar conteúdo por tipo',
        }, 500);
      }
    });

    // Health check
    this.app.get('/health', async (c) => {
      try {
        const stats = await this.featuredContentService.getFeaturedContentStats();

        return c.json({
          success: true,
          service: 'featured-content',
          status: 'healthy',
          data: {
            totalFeatured: stats.totalFeatured,
            activeCount: stats.activeCount,
            expiredCount: stats.expiredCount,
          },
        });

      } catch (error) {
        console.error('Featured content health check failed:', error);
        return c.json({
          success: false,
          service: 'featured-content',
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
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