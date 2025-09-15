import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { FeaturedPositionsService } from '../../services/FeaturedPositionsService';
import { getDrizzleClient } from '../../config/db';
import { Env } from '../../config/types/common';
import { authMiddleware } from '../../middlewares/auth';

// Layout configuration schema
const layoutConfigSchema = z.object({
  type: z.enum(['grid', 'carousel', 'list', 'banner', 'sidebar']).optional(),
  columns: z.number().int().min(1).max(12).optional(),
  rows: z.number().int().min(1).max(10).optional(),
  showThumbnails: z.boolean().optional(),
  showExcerpts: z.boolean().optional(),
  showDates: z.boolean().optional(),
  showAuthors: z.boolean().optional(),
  itemHeight: z.string().optional(),
  itemWidth: z.string().optional(),
  spacing: z.string().optional(),
  autoplay: z.boolean().optional(),
  autoplayDelay: z.number().int().min(1000).max(10000).optional(),
  pagination: z.boolean().optional(),
  navigation: z.boolean().optional(),
  responsive: z.object({
    mobile: z.object({
      columns: z.number().int().min(1).max(12).optional(),
      rows: z.number().int().min(1).max(10).optional(),
    }).optional(),
    tablet: z.object({
      columns: z.number().int().min(1).max(12).optional(),
      rows: z.number().int().min(1).max(10).optional(),
    }).optional(),
    desktop: z.object({
      columns: z.number().int().min(1).max(12).optional(),
      rows: z.number().int().min(1).max(10).optional(),
    }).optional(),
  }).optional(),
}).optional();

// Validation schemas
const createPositionSchema = z.object({
  positionKey: z.string().min(1, 'Position key é obrigatório').max(100),
  displayName: z.string().min(1, 'Display name é obrigatório').max(200),
  description: z.string().max(500).optional(),
  maxItems: z.number().int().min(1).max(100).optional().default(10),
  allowedTypes: z.array(z.string()).optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).optional(),
  layoutConfig: layoutConfigSchema,
});

const updatePositionSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  maxItems: z.number().int().min(1).max(100).optional(),
  allowedTypes: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  layoutConfig: layoutConfigSchema,
});

const listPositionsSchema = z.object({
  includeInactive: z.boolean().optional().default(false),
  sortBy: z.enum(['sortOrder', 'displayName', 'createdAt']).optional().default('sortOrder'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

const reorderPositionsSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    sortOrder: z.number().int().min(0),
  })).min(1),
});

const getByKeysSchema = z.object({
  keys: z.string().min(1), // Comma-separated list of keys
});

export class FeaturedPositionsController {
  private app: Hono;
  private positionsService: FeaturedPositionsService;

  constructor(env: Env) {
    this.app = new Hono();
    const db = getDrizzleClient(env);
    this.positionsService = new FeaturedPositionsService(db);
    this.setupRoutes();
  }

  private setupRoutes() {
    // Middleware de autenticação para todas as rotas
    this.app.use('*', authMiddleware);

    // Listar todas as posições
    this.app.get('/', zValidator('query', listPositionsSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const options = c.req.valid('query');

        console.log(`📋 Listing featured positions for user ${user.name}`);

        const positions = await this.positionsService.listPositions(options);

        return c.json({
          success: true,
          data: positions,
        });

      } catch (error) {
        console.error('Error listing featured positions:', error);
        return c.json({
          success: false,
          error: 'Erro ao listar posições',
        }, 500);
      }
    });

    // Criar nova posição
    this.app.post('/', zValidator('json', createPositionSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Verificar permissões (apenas admins podem criar/gerenciar posições)
        if (user.role !== 'admin') {
          return c.json({
            success: false,
            error: 'Apenas administradores podem gerenciar posições de destaque',
          }, 403);
        }

        const data = c.req.valid('json');

        console.log(`🎯 Creating featured position: ${data.positionKey} by admin ${user.name}`);

        const result = await this.positionsService.createPosition(data);

        if (result.success) {
          return c.json({
            success: true,
            message: result.message,
            data: result.position,
          }, 201);
        } else {
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }

      } catch (error) {
        console.error('Error creating featured position:', error);
        return c.json({
          success: false,
          error: 'Erro ao criar posição',
        }, 500);
      }
    });

    // Obter posição por ID
    this.app.get('/:id', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const id = c.req.param('id');

        console.log(`🔍 Getting featured position: ${id}`);

        const position = await this.positionsService.getPositionById(id);

        if (position) {
          return c.json({
            success: true,
            data: position,
          });
        } else {
          return c.json({
            success: false,
            error: 'Posição não encontrada',
          }, 404);
        }

      } catch (error) {
        console.error('Error getting featured position:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar posição',
        }, 500);
      }
    });

    // Atualizar posição
    this.app.put('/:id', zValidator('json', updatePositionSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Verificar permissões
        if (user.role !== 'admin') {
          return c.json({
            success: false,
            error: 'Apenas administradores podem gerenciar posições de destaque',
          }, 403);
        }

        const id = c.req.param('id');
        const data = c.req.valid('json');

        console.log(`✏️ Updating featured position: ${id} by admin ${user.name}`);

        const result = await this.positionsService.updatePosition(id, data);

        if (result.success) {
          return c.json({
            success: true,
            message: result.message,
            data: result.position,
          });
        } else {
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }

      } catch (error) {
        console.error('Error updating featured position:', error);
        return c.json({
          success: false,
          error: 'Erro ao atualizar posição',
        }, 500);
      }
    });

    // Deletar posição
    this.app.delete('/:id', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Verificar permissões
        if (user.role !== 'admin') {
          return c.json({
            success: false,
            error: 'Apenas administradores podem gerenciar posições de destaque',
          }, 403);
        }

        const id = c.req.param('id');

        console.log(`🗑️ Deleting featured position: ${id} by admin ${user.name}`);

        const result = await this.positionsService.deletePosition(id);

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
        console.error('Error deleting featured position:', error);
        return c.json({
          success: false,
          error: 'Erro ao deletar posição',
        }, 500);
      }
    });

    // Reordenar posições
    this.app.post('/reorder', zValidator('json', reorderPositionsSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Verificar permissões
        if (user.role !== 'admin') {
          return c.json({
            success: false,
            error: 'Apenas administradores podem reordenar posições',
          }, 403);
        }

        const { items } = c.req.valid('json');

        console.log(`🔄 Reordering ${items.length} featured positions by admin ${user.name}`);

        const result = await this.positionsService.reorderPositions(items);

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
        console.error('Error reordering featured positions:', error);
        return c.json({
          success: false,
          error: 'Erro ao reordenar posições',
        }, 500);
      }
    });

    // Obter posições por chaves (para frontend)
    this.app.get('/by-keys/:keys', async (c) => {
      try {
        const keysParam = c.req.param('keys');
        const keys = keysParam.split(',').filter(k => k.trim());

        if (keys.length === 0) {
          return c.json({
            success: false,
            error: 'Nenhuma chave fornecida',
          }, 400);
        }

        console.log(`🔑 Getting positions by keys: ${keys.join(', ')}`);

        const positions = await this.positionsService.getPositionsByKeys(keys);

        return c.json({
          success: true,
          data: positions,
        });

      } catch (error) {
        console.error('Error getting positions by keys:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar posições por chaves',
        }, 500);
      }
    });

    // Obter posição por chave
    this.app.get('/by-key/:key', async (c) => {
      try {
        const key = c.req.param('key');

        console.log(`🔑 Getting position by key: ${key}`);

        const position = await this.positionsService.getPositionByKey(key);

        if (position) {
          return c.json({
            success: true,
            data: position,
          });
        } else {
          return c.json({
            success: false,
            error: 'Posição não encontrada',
          }, 404);
        }

      } catch (error) {
        console.error('Error getting position by key:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar posição por chave',
        }, 500);
      }
    });

    // Inicializar posições padrão
    this.app.post('/initialize-defaults', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        if (user.role !== 'admin') {
          return c.json({
            success: false,
            error: 'Apenas administradores podem inicializar posições padrão',
          }, 403);
        }

        console.log(`🚀 Initializing default positions by admin ${user.name}`);

        const result = await this.positionsService.initializeDefaultPositions();

        return c.json({
          success: result.success,
          message: result.message,
          data: {
            created: result.created,
          },
        });

      } catch (error) {
        console.error('Error initializing default positions:', error);
        return c.json({
          success: false,
          error: 'Erro ao inicializar posições padrão',
        }, 500);
      }
    });

    // Health check
    this.app.get('/health', async (c) => {
      try {
        const positions = await this.positionsService.listPositions({
          includeInactive: false,
        });

        return c.json({
          success: true,
          service: 'featured-positions',
          status: 'healthy',
          data: {
            totalActivePositions: positions.length,
            availablePositions: positions.map(p => ({
              key: p.positionKey,
              name: p.displayName,
              maxItems: p.maxItems,
              layoutType: p.layoutConfig.type,
            })),
          },
        });

      } catch (error) {
        console.error('Featured positions health check failed:', error);
        return c.json({
          success: false,
          service: 'featured-positions',
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