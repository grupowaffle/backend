import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { WorkflowService, WorkflowStatus } from '../../services/WorkflowService';
import { getDrizzleClient } from '../../config/db';
import { Env } from '../../config/types/common';
import { authMiddleware } from '../../middlewares/auth';

// Validation schemas
const transitionSchema = z.object({
  articleId: z.string().min(1, 'Article ID is required'),
  toStatus: z.enum([
    'beehiiv_pending',
    'draft', 
    'review',
    'approved',
    'published',
    'archived',
    'rejected'
  ] as const),
  reason: z.string().optional(),
  feedback: z.string().optional(),
  publishedAt: z.string().datetime().optional(),
  scheduledFor: z.string().datetime().optional(),
});

const assignArticleSchema = z.object({
  articleId: z.string().min(1, 'Article ID is required'),
  assignedToUserId: z.string().min(1, 'Assigned user ID is required'),
});

const statusFilterSchema = z.object({
  status: z.enum([
    'beehiiv_pending',
    'draft', 
    'review',
    'approved',
    'published',
    'archived',
    'rejected',
    'all'
  ] as const).default('all'),
  page: z.string().transform(val => parseInt(val) || 1).default('1'),
  limit: z.string().transform(val => Math.min(50, parseInt(val) || 20)).default('20'),
  userId: z.string().optional(),
  assignedTo: z.string().optional(),
});

export class WorkflowController {
  private app: Hono;
  private workflowService: WorkflowService;

  constructor(env: Env) {
    this.app = new Hono();
    const db = getDrizzleClient(env);
    this.workflowService = new WorkflowService(db);
    this.setupRoutes();
  }

  private setupRoutes() {
    // Middleware de autenticação para todas as rotas
    this.app.use('*', authMiddleware);

    // Transicionar status de artigo
    this.app.post('/transition', zValidator('json', transitionSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const data = c.req.valid('json');
        
        console.log(`🔄 Workflow transition requested by ${user.name} (${user.role}): ${data.articleId} -> ${data.toStatus}`);

        const options: any = {
          reason: data.reason,
          feedback: data.feedback,
        };

        if (data.publishedAt) {
          options.publishedAt = new Date(data.publishedAt);
        }
        
        if (data.scheduledFor) {
          options.scheduledFor = new Date(data.scheduledFor);
        }

        const result = await this.workflowService.transitionStatus(
          data.articleId,
          data.toStatus,
          user.id,
          user.name || user.email,
          user.role,
          options
        );

        if (result.success) {
          console.log(`✅ Workflow transition successful: ${data.articleId} -> ${data.toStatus}`);
          return c.json({
            success: true,
            message: result.message,
            data: result.article,
          });
        } else {
          console.log(`❌ Workflow transition failed: ${result.message}`);
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }
      } catch (error) {
        console.error('Error in workflow transition:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Erro na transição de status',
        }, 500);
      }
    });

    // Obter artigos por status
    this.app.get('/articles', zValidator('query', statusFilterSchema), async (c) => {
      try {
        const params = c.req.valid('query');
        const user = c.get('user');

        console.log(`📋 Getting articles by status: ${params.status} (page ${params.page})`);

        let status: WorkflowStatus | WorkflowStatus[] | undefined;
        
        if (params.status !== 'all') {
          status = params.status as WorkflowStatus;
        }

        const options = {
          page: params.page,
          limit: params.limit,
          userId: params.userId,
          assignedTo: params.assignedTo,
        };

        // Se usuário não é admin/editor-chefe, filtrar apenas seus artigos
        if (!['admin', 'editor-chefe'].includes(user?.role || '')) {
          options.userId = user?.id;
        }

        let result;
        if (status) {
          result = await this.workflowService.getArticlesByStatus(status, options);
        } else {
          // Para 'all', buscar todos os status relevantes baseado no role do usuário
          const userRole = user?.role || 'editor';
          const availableStatuses = this.getStatusesForRole(userRole);
          result = await this.workflowService.getArticlesByStatus(availableStatuses, options);
        }

        return c.json({
          success: true,
          data: result.articles,
          pagination: result.pagination,
          total: result.total,
        });
      } catch (error) {
        console.error('Error getting articles by status:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar artigos',
        }, 500);
      }
    });

    // Obter histórico de workflow de um artigo
    this.app.get('/articles/:id/history', async (c) => {
      try {
        const articleId = c.req.param('id');

        console.log(`📜 Getting workflow history for article: ${articleId}`);

        const history = await this.workflowService.getWorkflowHistory(articleId);

        return c.json({
          success: true,
          data: history,
        });
      } catch (error) {
        console.error('Error getting workflow history:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar histórico',
        }, 500);
      }
    });

    // Atribuir artigo a um editor
    this.app.post('/assign', zValidator('json', assignArticleSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Apenas admin e editor-chefe podem atribuir artigos
        if (!['admin', 'editor-chefe'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Permissão insuficiente para atribuir artigos',
          }, 403);
        }

        const { articleId, assignedToUserId } = c.req.valid('json');

        console.log(`👤 Assigning article ${articleId} to user ${assignedToUserId} by ${user.name}`);

        const result = await this.workflowService.assignArticle(
          articleId,
          assignedToUserId,
          user.id,
          user.name || user.email,
          user.role
        );

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
        console.error('Error assigning article:', error);
        return c.json({
          success: false,
          error: 'Erro ao atribuir artigo',
        }, 500);
      }
    });

    // Obter transições disponíveis para um artigo
    this.app.get('/articles/:id/transitions', async (c) => {
      try {
        const articleId = c.req.param('id');
        const user = c.get('user');
        
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Buscar artigo para obter status atual
        // Aqui usaríamos o ArticleRepository, mas vamos simplificar
        const currentStatus = c.req.query('currentStatus') as WorkflowStatus;
        
        if (!currentStatus) {
          return c.json({
            success: false,
            error: 'Status atual do artigo é obrigatório',
          }, 400);
        }

        const availableTransitions = this.workflowService.getAvailableTransitions(
          currentStatus,
          user.role
        );

        return c.json({
          success: true,
          data: {
            currentStatus,
            availableTransitions,
            userRole: user.role,
          },
        });
      } catch (error) {
        console.error('Error getting available transitions:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar transições disponíveis',
        }, 500);
      }
    });

    // Obter estatísticas do workflow
    this.app.get('/stats', async (c) => {
      try {
        const user = c.get('user');
        
        // Apenas admin, editor-chefe e developer podem ver todas as estatísticas
        if (!['admin', 'editor-chefe', 'developer'].includes(user?.role || '')) {
          return c.json({
            success: false,
            error: 'Permissão insuficiente para ver estatísticas completas',
          }, 403);
        }

        console.log('📊 Getting workflow statistics');

        const stats = await this.workflowService.getWorkflowStats();

        return c.json({
          success: true,
          data: stats,
        });
      } catch (error) {
        console.error('Error getting workflow stats:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar estatísticas',
        }, 500);
      }
    });

    // Processar publicações agendadas (endpoint para cron job)
    this.app.post('/process-scheduled', async (c) => {
      try {
        const user = c.get('user');
        
        // Apenas admin e developer podem processar publicações agendadas manualmente
        if (!['admin', 'developer'].includes(user?.role || '')) {
          return c.json({
            success: false,
            error: 'Apenas administradores e desenvolvedores podem processar publicações agendadas',
          }, 403);
        }

        console.log('📅 Processing scheduled publications manually');

        const result = await this.workflowService.processScheduledPublications();

        return c.json({
          success: true,
          message: `${result.published} artigos publicados`,
          data: {
            published: result.published,
            errors: result.errors,
          },
        });
      } catch (error) {
        console.error('Error processing scheduled publications:', error);
        return c.json({
          success: false,
          error: 'Erro ao processar publicações agendadas',
        }, 500);
      }
    });

    // Dashboard resumo (artigos do usuário atual)
    this.app.get('/dashboard', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        console.log(`📊 Getting workflow dashboard for user: ${user.name} (${user.role})`);

        // Buscar artigos do usuário por status
        const myDrafts = await this.workflowService.getArticlesByStatus('draft', { userId: user.id, limit: 5 });
        const myReviews = await this.workflowService.getArticlesByStatus('review', { userId: user.id, limit: 5 });
        
        // Se é revisor/editor-chefe, buscar artigos atribuídos para revisão
        let assignedReviews = { articles: [], total: 0 };
        if (['revisor', 'editor-chefe', 'admin'].includes(user.role)) {
          assignedReviews = await this.workflowService.getArticlesByStatus('review', { assignedTo: user.id, limit: 10 });
        }

        // Estatísticas básicas se for admin/editor-chefe
        let stats = null;
        if (['admin', 'editor-chefe'].includes(user.role)) {
          stats = await this.workflowService.getWorkflowStats();
        }

        return c.json({
          success: true,
          data: {
            user: {
              id: user.id,
              name: user.name,
              role: user.role,
            },
            myDrafts: {
              articles: myDrafts.articles,
              total: myDrafts.total,
            },
            myReviews: {
              articles: myReviews.articles,
              total: myReviews.total,
            },
            assignedReviews: {
              articles: assignedReviews.articles,
              total: assignedReviews.total,
            },
            stats,
          },
        });
      } catch (error) {
        console.error('Error getting workflow dashboard:', error);
        return c.json({
          success: false,
          error: 'Erro ao carregar dashboard',
        }, 500);
      }
    });
  }

  /**
   * Obter status relevantes para um role
   */
  private getStatusesForRole(role: string): WorkflowStatus[] {
    const roleStatuses: Record<string, WorkflowStatus[]> = {
      admin: ['beehiiv_pending', 'draft', 'review', 'approved', 'published', 'archived', 'rejected'],
      'editor-chefe': ['beehiiv_pending', 'draft', 'review', 'approved', 'published', 'rejected'],
      editor: ['draft', 'review'],
      revisor: ['review', 'approved', 'rejected'],
    };

    return roleStatuses[role] || ['draft'];
  }

  /**
   * Get the Hono app
   */
  getApp() {
    return this.app;
  }
}