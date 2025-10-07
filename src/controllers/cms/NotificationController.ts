import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { NotificationService } from '../../services/NotificationService';
import { NotificationSettingsRepository } from '../../repositories/NotificationSettingsRepository';
import { getDrizzleClient } from '../../config/db';
import { Env } from '../../config/types/common';

// Validation schemas
const notificationSettingsSchema = z.object({
  webhookUrl: z.string().url('URL do webhook inválida'),
  enabled: z.boolean().default(false),
  notifications: z.object({
    newArticle: z.boolean().default(true),
    statusChange: z.boolean().default(true),
    changeRequest: z.boolean().default(true),
    approval: z.boolean().default(true),
    publication: z.boolean().default(true),
    rejection: z.boolean().default(true),
    beehiivSync: z.boolean().default(true),
    archive: z.boolean().default(false)
  }).optional()
});

const testNotificationSchema = z.object({
  webhookUrl: z.string().url('URL do webhook inválida'),
  message: z.object({
    title: z.string(),
    description: z.string(),
    url: z.string().optional(),
    imageUrl: z.string().optional(),
    category: z.enum(['success', 'warning', 'error', 'info', 'technology']),
    source: z.string(),
    author: z.string().optional(),
    status: z.string().optional(),
    timestamp: z.string().optional()
  }).optional()
});

export class NotificationController {
  private app: Hono;
  private env: Env;
  private notificationService: NotificationService;
  private settingsRepository: NotificationSettingsRepository;

  constructor(env: Env) {
    this.app = new Hono();
    this.env = env;
    
    // Initialize database connection
    const db = getDrizzleClient(env);
    this.notificationService = new NotificationService(db as any);
    this.settingsRepository = new NotificationSettingsRepository(db as any);
    
    this.setupRoutes();
  }

  private setupRoutes() {
    // Obter configurações de notificação
    this.app.get('/settings', async (c) => {
      try {
        const settings = await this.settingsRepository.getSettings();

        return c.json({
          success: true,
          data: settings
        });
      } catch (error) {
        return c.json({
          success: false,
          error: 'Falha ao obter configurações de notificação'
        }, 500);
      }
    });

    // Salvar configurações de notificação
    this.app.post('/settings', zValidator('json', notificationSettingsSchema), async (c) => {
      try {
        const settings = c.req.valid('json');
        
        // Garantir que notifications não seja undefined
        const settingsWithDefaults = {
          ...settings,
          notifications: settings.notifications || {
            newArticle: true,
            statusChange: true,
            changeRequest: true,
            approval: true,
            publication: true,
            rejection: true,
            beehiivSync: true,
            archive: false
          }
        };
        
        const result = await this.settingsRepository.saveSettings(settingsWithDefaults);
        
        return c.json({
          success: true,
          message: 'Configurações de notificação salvas com sucesso',
          data: result
        });
      } catch (error) {
        return c.json({
          success: false,
          error: `Falha ao salvar configurações de notificação: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Testar notificação
    this.app.post('/test', zValidator('json', testNotificationSchema), async (c) => {
      try {
        const { webhookUrl, message } = c.req.valid('json');
        
        // Usar mensagem fornecida ou criar uma de teste
        const testMessage = message || {
          title: "🧪 Teste de Notificação",
          description: "Esta é uma mensagem de teste para verificar se a integração com o Slack está funcionando corretamente.",
          category: 'info' as const,
          source: "Portal CMS",
          timestamp: new Date().toISOString()
        };

        const success = await this.notificationService.sendSlackNotification(webhookUrl, testMessage);

        if (success) {
          return c.json({
            success: true,
            message: 'Teste de notificação enviado com sucesso'
          });
        } else {
          return c.json({
            success: false,
            error: 'Falha ao enviar teste de notificação'
        }, 500);
        }
      } catch (error) {
        return c.json({
          success: false,
          error: 'Falha ao testar notificação'
        }, 500);
      }
    });


    // Obter estatísticas de notificações
    this.app.get('/stats', async (c) => {
      try {
        // Em produção, isso retornaria estatísticas reais do banco de dados
        const stats = {
          totalNotifications: 0,
          successfulNotifications: 0,
          failedNotifications: 0,
          lastNotification: null,
          webhookStatus: 'unknown'
        };

        return c.json({
          success: true,
          data: stats
        });
      } catch (error) {
        return c.json({
          success: false,
          error: 'Falha ao obter estatísticas'
        }, 500);
      }
    });
  }

  getApp() {
    return this.app;
  }
}