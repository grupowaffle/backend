import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { WorkflowService, WorkflowStatus } from '../../services/WorkflowService';
import { getDrizzleClient } from '../../config/db';
import { workflowHistory } from '../../config/db/schema';
import { eq } from 'drizzle-orm';
import { Env } from '../../config/types/common';
import { authMiddleware } from '../../middlewares/auth';

// Validation schemas
const transitionSchema = z.object({
  articleId: z.string().min(1, 'Article ID is required'),
  toStatus: z.enum([
    'beehiiv_pending',
    'draft', 
    'review',
    'solicitado_mudancas',
    'revisado',
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

const requestChangesSchema = z.object({
  articleId: z.string().min(1, 'Article ID is required'),
  changesRequested: z.string().min(1, 'Changes requested is required'),
  reason: z.string().optional(),
});

const statusFilterSchema = z.object({
  status: z.enum([
    'beehiiv_pending',
    'draft', 
    'review',
    'solicitado_mudancas',
    'revisado',
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
    // Middleware de autenticação já é aplicado no createCMSRoutes

    // Transicionar status de artigo
    this.app.post('/transition', zValidator('json', transitionSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const data = c.req.valid('json');
        
        // Workflow transition requested

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
          // Workflow transition successful
          return c.json({
            success: true,
            message: result.message,
            data: result.article,
          });
        } else {
          // Workflow transition failed
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }
      } catch (error) {
        // Error in workflow transition
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Erro na transição de status',
        }, 500);
      }
    });

    // Solicitar mudanças em um artigo
    this.app.post('/request-changes', authMiddleware, zValidator('json', requestChangesSchema), async (c) => {
      try {
        console.log('🔍 [REQUEST-CHANGES] Iniciando solicitação de mudanças');
        console.log('🔍 [REQUEST-CHANGES] Headers:', Object.fromEntries(c.req.raw.headers.entries()));
        console.log('🔍 [REQUEST-CHANGES] Content-Type:', c.req.header('content-type'));
        
        const user = c.get('user');
        const data = c.req.valid('json');
        
        console.log('📝 [REQUEST-CHANGES] Dados validados:', data);

        console.log('👤 [REQUEST-CHANGES] Usuário:', user);
        console.log('📝 [REQUEST-CHANGES] Dados recebidos:', data);

        // Verificar se o usuário está autenticado
        if (!user) {
          console.log('❌ [REQUEST-CHANGES] Usuário não autenticado');
          return c.json({
            success: false,
            error: 'Usuário não autenticado'
          }, 401);
        }

        // Verificar se o usuário tem permissão para solicitar mudanças
        if (!['revisor', 'editor-chefe', 'admin', 'super_admin'].includes(user.role)) {
          console.log('❌ [REQUEST-CHANGES] Usuário sem permissão:', user.role);
          return c.json({
            success: false,
            error: 'Usuário não tem permissão para solicitar mudanças',
          }, 403);
        }

        console.log('✅ [REQUEST-CHANGES] Usuário autorizado, fazendo transição...');
        console.log('📝 [REQUEST-CHANGES] Dados para transição:', {
          articleId: data.articleId,
          toStatus: 'solicitado_mudancas',
          userId: user.id,
          userName: user.name || user.email,
          userRole: user.role,
          feedback: data.changesRequested,
          reason: data.reason,
        });

        // Fazer a transição para 'solicitado_mudancas' com feedback
        const result = await this.workflowService.transitionStatus(
          data.articleId,
          'solicitado_mudancas',
          user.id,
          user.name || user.email,
          user.role,
          {
            feedback: data.changesRequested,
            reason: data.reason,
          }
        );

        console.log('🔄 [REQUEST-CHANGES] Resultado da transição:', result);

        if (result.success) {
          return c.json({
            success: true,
            message: 'Mudanças solicitadas com sucesso',
            data: result.article,
          });
        } else {
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }
      } catch (error) {
        console.error('❌ [REQUEST-CHANGES] Erro:', error);
        console.error('❌ [REQUEST-CHANGES] Stack:', error instanceof Error ? error.stack : 'No stack');
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Erro ao solicitar mudanças',
        }, 500);
      }
    });

    // Obter artigos por status
    this.app.get('/articles', zValidator('query', statusFilterSchema), async (c) => {
      try {
        const params = c.req.valid('query');
        const user = c.get('user');

        // Getting articles by status

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
        // Error getting articles by status
        return c.json({
          success: false,
          error: 'Erro ao buscar artigos',
        }, 500);
      }
    });

    // Endpoint de teste para inserir histórico diretamente
    this.app.post('/test-insert-history', async (c) => {
      try {
        const testData = {
          id: 'test_' + Date.now(),
          articleId: 'id_3rfxd6jvwmgb0dubu',
          fromStatus: 'review',
          toStatus: 'solicitado_mudancas',
          userId: 'test_user',
          userName: 'Test User',
          userRole: 'revisor',
          reason: 'Teste direto',
          feedback: 'Este é um teste de inserção direta',
          createdAt: new Date(),
        };

        console.log('🧪 [TEST-INSERT] Inserindo dados de teste:', testData);
        
        const result = await this.workflowService.recordWorkflowHistory(testData);
        console.log('🧪 [TEST-INSERT] Resultado:', result);

        return c.json({
          success: true,
          message: 'Teste de inserção realizado',
          data: testData,
        });
      } catch (error) {
        console.error('❌ [TEST-INSERT] Erro:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Erro no teste',
        }, 500);
      }
    });

    // Obter histórico de workflow de um artigo
    this.app.get('/articles/:id/history', async (c) => {
      try {
        const articleId = c.req.param('id');
        console.log('🔍 [WORKFLOW-HISTORY] Buscando histórico para artigo:', articleId);

        // Getting workflow history
        const history = await this.workflowService.getWorkflowHistory(articleId);
        console.log('📝 [WORKFLOW-HISTORY] Histórico encontrado:', history);

        return c.json({
          success: true,
          data: history,
        });
      } catch (error) {
        console.error('❌ [WORKFLOW-HISTORY] Erro:', error);
        // Error getting workflow history
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

        // Assigning article

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
        // Error assigning article
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
        // Error getting available transitions
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

        // Getting workflow statistics

        const stats = await this.workflowService.getWorkflowStats();

        return c.json({
          success: true,
          data: stats,
        });
      } catch (error) {
        // Error getting workflow stats
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

        // Processing scheduled publications

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
        // Error processing scheduled publications
        return c.json({
          success: false,
          error: 'Erro ao processar publicações agendadas',
        }, 500);
      }
    });

    // Debug endpoint para testar inserção de histórico (sem auth para teste)
    this.app.post('/debug-history', async (c) => {
      try {
        const { articleId, feedback, reason } = await c.req.json();
        
        console.log('🔍 [DEBUG-HISTORY] Testando inserção:', { articleId, feedback, reason });
        
        // Tentar inserir um registro de teste
        const testRecord = {
          articleId,
          fromStatus: 'review',
          toStatus: 'solicitado_mudancas',
          userId: 'test-user',
          userName: 'Test User',
          userRole: 'revisor',
          reason: reason || 'Teste de inserção',
          feedback: feedback || 'Feedback de teste',
        };
        
        console.log('📝 [DEBUG-HISTORY] Inserindo registro de teste:', testRecord);
        
        // Inserir diretamente na tabela
        const db = getDrizzleClient(c.env);
        const result = await db.insert(workflowHistory).values({
          id: `test_${Date.now()}`,
          ...testRecord,
          createdAt: new Date(),
        });
        
        console.log('✅ [DEBUG-HISTORY] Registro inserido:', result);
        
        // Buscar histórico atual
        const history = await this.workflowService.getWorkflowHistory(articleId);
        console.log('📝 [DEBUG-HISTORY] Histórico atual:', history);
        
        return c.json({
          success: true,
          data: history,
          testRecord,
        });
      } catch (error) {
        console.error('❌ [DEBUG-HISTORY] Erro:', error);
        return c.json({
          success: false,
          error: 'Erro ao testar histórico',
        }, 500);
      }
    });

    // Endpoint GET simples para testar conexão
    this.app.get('/test-connection', async (c) => {
      try {
        console.log('🔍 [TEST-CONNECTION] Testando conexão com banco...');
        
        const db = getDrizzleClient(c.env);
        const result = await db.select().from(workflowHistory).limit(1);
        
        console.log('✅ [TEST-CONNECTION] Conexão OK, registros encontrados:', result.length);
        
        return c.json({
          success: true,
          message: 'Conexão com banco OK',
          records: result.length,
        });
      } catch (error) {
        console.error('❌ [TEST-CONNECTION] Erro:', error);
        return c.json({
          success: false,
          error: error.message,
        }, 500);
      }
    });

    // Endpoint POST para testar inserção direta (sem auth)
    this.app.post('/test-insert', async (c) => {
      try {
        console.log('🔍 [TEST-INSERT] Testando inserção direta...');
        
        const { articleId, feedback, reason } = await c.req.json();
        
        const testData = {
          id: `test_${Date.now()}`,
          articleId: articleId || 'id_3rfxd6jvwmgb0dubu',
          fromStatus: 'review',
          toStatus: 'solicitado_mudancas',
          userId: 'test-user',
          userName: 'Test User',
          userRole: 'revisor',
          reason: reason || 'Teste de inserção direta',
          feedback: feedback || 'Feedback de teste direto',
          createdAt: new Date(),
        };

        console.log('📝 [TEST-INSERT] Dados para inserir:', testData);
        
        const db = getDrizzleClient(c.env);
        const result = await db.insert(workflowHistory).values(testData);
        
        console.log('✅ [TEST-INSERT] Inserção realizada:', result);
        
        // Verificar se foi inserido
        const inserted = await db
          .select()
          .from(workflowHistory)
          .where(eq(workflowHistory.articleId, testData.articleId));
        
        console.log('📝 [TEST-INSERT] Dados inseridos:', inserted);
        
        return c.json({
          success: true,
          message: 'Inserção realizada com sucesso',
          testData,
          inserted,
        });
      } catch (error) {
        console.error('❌ [TEST-INSERT] Erro:', error);
        return c.json({
          success: false,
          error: error.message,
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

        // Getting workflow dashboard

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
        // Error getting workflow dashboard
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