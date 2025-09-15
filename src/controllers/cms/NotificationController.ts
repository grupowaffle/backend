import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { NotificationService, NotificationType, NotificationPriority } from '../../services/NotificationService';
import { getDrizzleClient } from '../../config/db';
import { Env } from '../../config/types/common';
import { authMiddleware } from '../../middlewares/auth';

// Validation schemas
const getNotificationsSchema = z.object({
  page: z.string().transform(val => parseInt(val) || 1).default('1'),
  limit: z.string().transform(val => Math.min(50, parseInt(val) || 20)).default('20'),
  unreadOnly: z.string().transform(val => val === 'true').default('false'),
  type: z.enum([
    'article_status_changed',
    'article_assigned', 
    'article_published',
    'article_rejected',
    'new_beehiiv_content',
    'scheduled_publication',
    'system_alert',
    'workflow_reminder'
  ] as const).optional(),
});

const createNotificationSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  type: z.enum([
    'article_status_changed',
    'article_assigned', 
    'article_published',
    'article_rejected',
    'new_beehiiv_content',
    'scheduled_publication',
    'system_alert',
    'workflow_reminder'
  ] as const),
  title: z.string().min(1, 'Title is required').max(200),
  message: z.string().min(1, 'Message is required').max(1000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  data: z.any().optional(),
  actionUrl: z.string().optional(),
  actionText: z.string().optional(),
});

const systemAlertSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  message: z.string().min(1, 'Message is required').max(1000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  data: z.any().optional(),
});

export class NotificationController {
  private app: Hono;
  private notificationService: NotificationService;

  constructor(env: Env) {
    this.app = new Hono();
    const db = getDrizzleClient(env);
    this.notificationService = new NotificationService(db);
    this.setupRoutes();
  }

  private setupRoutes() {
    // Middleware de autenticação para todas as rotas
    this.app.use('*', authMiddleware);

    // Obter notificações do usuário atual
    this.app.get('/', zValidator('query', getNotificationsSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const params = c.req.valid('query');

        console.log(`🔔 Getting notifications for user ${user.name} (${user.id})`);

        const result = await this.notificationService.getUserNotifications(user.id, {
          page: params.page,
          limit: params.limit,
          unreadOnly: params.unreadOnly,
          type: params.type,
        });

        return c.json({
          success: true,
          data: result.notifications,
          pagination: {
            page: params.page,
            limit: params.limit,
            total: result.total,
            totalPages: Math.ceil(result.total / params.limit),
          },
          unread: result.unread,
        });
      } catch (error) {
        console.error('Error getting notifications:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar notificações',
        }, 500);
      }
    });

    // Obter apenas notificações não lidas
    this.app.get('/unread', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const result = await this.notificationService.getUserNotifications(user.id, {
          unreadOnly: true,
          limit: 50, // Mais notificações não lidas
        });

        return c.json({
          success: true,
          data: result.notifications,
          count: result.unread,
        });
      } catch (error) {
        console.error('Error getting unread notifications:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar notificações não lidas',
        }, 500);
      }
    });

    // Obter contador de notificações não lidas
    this.app.get('/unread/count', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const result = await this.notificationService.getUserNotifications(user.id, {
          unreadOnly: true,
          limit: 1, // Só queremos o contador
        });

        return c.json({
          success: true,
          count: result.unread,
        });
      } catch (error) {
        console.error('Error getting unread count:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar contador',
        }, 500);
      }
    });

    // Marcar notificação como lida
    this.app.put('/:id/read', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const notificationId = c.req.param('id');

        console.log(`✅ Marking notification ${notificationId} as read for user ${user.id}`);

        const success = await this.notificationService.markAsRead(notificationId, user.id);

        if (success) {
          return c.json({
            success: true,
            message: 'Notificação marcada como lida',
          });
        } else {
          return c.json({
            success: false,
            error: 'Notificação não encontrada',
          }, 404);
        }
      } catch (error) {
        console.error('Error marking notification as read:', error);
        return c.json({
          success: false,
          error: 'Erro ao marcar como lida',
        }, 500);
      }
    });

    // Marcar todas as notificações como lidas
    this.app.put('/read-all', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        console.log(`✅ Marking all notifications as read for user ${user.id}`);

        const count = await this.notificationService.markAllAsRead(user.id);

        return c.json({
          success: true,
          message: 'Todas as notificações marcadas como lidas',
          count,
        });
      } catch (error) {
        console.error('Error marking all notifications as read:', error);
        return c.json({
          success: false,
          error: 'Erro ao marcar todas como lidas',
        }, 500);
      }
    });

    // Deletar notificação
    this.app.delete('/:id', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const notificationId = c.req.param('id');

        console.log(`🗑️ Deleting notification ${notificationId} for user ${user.id}`);

        const success = await this.notificationService.deleteNotification(notificationId, user.id);

        if (success) {
          return c.json({
            success: true,
            message: 'Notificação removida',
          });
        } else {
          return c.json({
            success: false,
            error: 'Notificação não encontrada',
          }, 404);
        }
      } catch (error) {
        console.error('Error deleting notification:', error);
        return c.json({
          success: false,
          error: 'Erro ao remover notificação',
        }, 500);
      }
    });

    // Criar notificação (apenas para admins)
    this.app.post('/', zValidator('json', createNotificationSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        if (!['admin', 'developer'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Apenas administradores e desenvolvedores podem criar notificações',
          }, 403);
        }

        const data = c.req.valid('json');

        console.log(`🔔 Creating notification for user ${data.userId} by admin ${user.id}`);

        const notification = await this.notificationService.createNotification(data);

        return c.json({
          success: true,
          data: notification,
        }, 201);
      } catch (error) {
        console.error('Error creating notification:', error);
        return c.json({
          success: false,
          error: 'Erro ao criar notificação',
        }, 500);
      }
    });

    // Enviar alerta do sistema (apenas para admins)
    this.app.post('/system-alert', zValidator('json', systemAlertSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        if (!['admin', 'developer'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Apenas administradores e desenvolvedores podem enviar alertas do sistema',
          }, 403);
        }

        const data = c.req.valid('json');

        console.log(`🚨 Creating system alert by admin ${user.id}: ${data.title}`);

        await this.notificationService.notifySystemAlert(
          data.title,
          data.message,
          data.priority,
          data.data
        );

        return c.json({
          success: true,
          message: 'Alerta do sistema enviado para todos os administradores',
        });
      } catch (error) {
        console.error('Error creating system alert:', error);
        return c.json({
          success: false,
          error: 'Erro ao enviar alerta do sistema',
        }, 500);
      }
    });

    // Obter estatísticas de notificações
    this.app.get('/stats', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Admins podem ver stats gerais, outros usuários apenas as suas
        const userId = user.role === 'admin' ? undefined : user.id;

        console.log(`📊 Getting notification stats for ${userId ? 'user ' + userId : 'all users'}`);

        const stats = await this.notificationService.getNotificationStats(userId);

        return c.json({
          success: true,
          data: stats,
        });
      } catch (error) {
        console.error('Error getting notification stats:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar estatísticas',
        }, 500);
      }
    });

    // Processar lembretes de workflow (cron job endpoint)
    this.app.post('/process-reminders', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        if (!['admin', 'developer'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Apenas administradores e desenvolvedores podem processar lembretes',
          }, 403);
        }

        console.log('⏰ Processing workflow reminders manually');

        await this.notificationService.notifyWorkflowReminders();

        return c.json({
          success: true,
          message: 'Lembretes de workflow processados',
        });
      } catch (error) {
        console.error('Error processing workflow reminders:', error);
        return c.json({
          success: false,
          error: 'Erro ao processar lembretes',
        }, 500);
      }
    });

    // Limpar notificações antigas (cron job endpoint)
    this.app.post('/cleanup', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        if (!['admin', 'developer'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Apenas administradores e desenvolvedores podem limpar notificações',
          }, 403);
        }

        const days = parseInt(c.req.query('days') || '30');

        console.log(`🧹 Cleaning up notifications older than ${days} days`);

        const count = await this.notificationService.cleanupOldNotifications(days);

        return c.json({
          success: true,
          message: `${count} notificações antigas removidas`,
          count,
        });
      } catch (error) {
        console.error('Error cleaning up notifications:', error);
        return c.json({
          success: false,
          error: 'Erro ao limpar notificações',
        }, 500);
      }
    });

    // Health check do serviço de notificações
    this.app.get('/health', async (c) => {
      try {
        const user = c.get('user');
        const stats = await this.notificationService.getNotificationStats(user?.id);

        return c.json({
          success: true,
          service: 'notifications',
          status: 'healthy',
          data: {
            totalNotifications: stats.total,
            unreadNotifications: stats.unread,
            userRole: user?.role,
          },
        });
      } catch (error) {
        console.error('Notification service health check failed:', error);
        return c.json({
          success: false,
          service: 'notifications',
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