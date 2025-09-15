import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { AuditService } from '../../services/AuditService';
import { getDrizzleClient } from '../../config/db';
import { Env } from '../../config/types/common';
import { authMiddleware } from '../../middlewares/auth';

// Validation schemas
const auditLogsQuerySchema = z.object({
  userId: z.string().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
  success: z.boolean().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  ipAddress: z.string().optional(),
  search: z.string().optional(),
  page: z.string().transform(val => Math.max(1, parseInt(val) || 1)).default('1'),
  limit: z.string().transform(val => Math.min(100, Math.max(1, parseInt(val) || 50))).default('50'),
  sortBy: z.enum(['createdAt', 'action', 'userName']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

const securityEventsQuerySchema = z.object({
  eventType: z.string().optional(),
  severity: z.string().optional(),
  category: z.string().optional(),
  resolved: z.boolean().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  userId: z.string().optional(),
  page: z.string().transform(val => Math.max(1, parseInt(val) || 1)).default('1'),
  limit: z.string().transform(val => Math.min(100, Math.max(1, parseInt(val) || 50))).default('50'),
  sortBy: z.enum(['createdAt', 'severity', 'eventType']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

const resolveSecurityEventSchema = z.object({
  resolution: z.string().min(1, 'Resolução é obrigatória').max(1000),
});

const logSecurityEventSchema = z.object({
  eventType: z.string().min(1, 'Tipo do evento é obrigatório'),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.string().min(1, 'Categoria é obrigatória'),
  description: z.string().min(1, 'Descrição é obrigatória').max(1000),
  userId: z.string().optional(),
  userEmail: z.string().email().optional(),
  additionalData: z.record(z.any()).optional(),
});

const cleanupLogsSchema = z.object({
  auditLogsDays: z.number().min(7).max(365).optional().default(90),
  securityEventsDays: z.number().min(30).max(365).optional().default(365),
});

export class AuditController {
  private app: Hono;
  private auditService: AuditService;

  constructor(env: Env) {
    this.app = new Hono();
    const db = getDrizzleClient(env);
    this.auditService = new AuditService(db);
    this.setupRoutes();
  }

  private setupRoutes() {
    // Middleware de autenticação para todas as rotas
    this.app.use('*', authMiddleware);

    // Verificar permissões para auditoria (apenas admins)
    this.app.use('*', async (c, next) => {
      const user = c.get('user');
      if (!user) {
        return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
      }

      if (user.role !== 'admin') {
        return c.json({
          success: false,
          error: 'Apenas administradores podem acessar logs de auditoria',
        }, 403);
      }

      await next();
    });

    // Listar logs de auditoria
    this.app.get('/logs', zValidator('query', auditLogsQuerySchema), async (c) => {
      try {
        const user = c.get('user');
        const query = c.req.valid('query');

        console.log(`📋 Admin ${user?.name} accessing audit logs`);

        // Parse dates
        const searchQuery = {
          ...query,
          startDate: query.startDate ? new Date(query.startDate) : undefined,
          endDate: query.endDate ? new Date(query.endDate) : undefined,
          action: query.action ? query.action.split(',') : undefined,
          resource: query.resource ? query.resource.split(',') : undefined,
        };

        const result = await this.auditService.getAuditLogs(searchQuery);

        return c.json({
          success: true,
          data: result.logs,
          pagination: result.pagination,
        });

      } catch (error) {
        console.error('Error getting audit logs:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar logs de auditoria',
        }, 500);
      }
    });

    // Listar eventos de segurança
    this.app.get('/security-events', zValidator('query', securityEventsQuerySchema), async (c) => {
      try {
        const user = c.get('user');
        const query = c.req.valid('query');

        console.log(`🚨 Admin ${user?.name} accessing security events`);

        // Parse dates and arrays
        const searchQuery = {
          ...query,
          startDate: query.startDate ? new Date(query.startDate) : undefined,
          endDate: query.endDate ? new Date(query.endDate) : undefined,
          eventType: query.eventType ? query.eventType.split(',') : undefined,
          severity: query.severity ? query.severity.split(',') : undefined,
        };

        const result = await this.auditService.getSecurityEvents(searchQuery);

        return c.json({
          success: true,
          data: result.events,
          pagination: result.pagination,
        });

      } catch (error) {
        console.error('Error getting security events:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar eventos de segurança',
        }, 500);
      }
    });

    // Resolver evento de segurança
    this.app.post('/security-events/:id/resolve', zValidator('json', resolveSecurityEventSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const eventId = c.req.param('id');
        const { resolution } = c.req.valid('json');

        console.log(`✅ Admin ${user.name} resolving security event: ${eventId}`);

        const result = await this.auditService.resolveSecurityEvent(eventId, user.id, resolution);

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
        console.error('Error resolving security event:', error);
        return c.json({
          success: false,
          error: 'Erro ao resolver evento de segurança',
        }, 500);
      }
    });

    // Registrar evento de segurança manualmente
    this.app.post('/security-events', zValidator('json', logSecurityEventSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const data = c.req.valid('json');

        console.log(`🚨 Admin ${user.name} logging security event: ${data.eventType}`);

        const eventId = await this.auditService.logSecurityEvent({
          ...data,
          ipAddress: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown',
          userAgent: c.req.header('User-Agent'),
        });

        if (eventId) {
          return c.json({
            success: true,
            message: 'Evento de segurança registrado com sucesso',
            data: { eventId },
          }, 201);
        } else {
          return c.json({
            success: false,
            error: 'Erro ao registrar evento de segurança',
          }, 500);
        }

      } catch (error) {
        console.error('Error logging security event:', error);
        return c.json({
          success: false,
          error: 'Erro ao registrar evento de segurança',
        }, 500);
      }
    });

    // Obter estatísticas de auditoria
    this.app.get('/stats', async (c) => {
      try {
        const user = c.get('user');
        const days = parseInt(c.req.query('days') || '30');

        console.log(`📊 Admin ${user?.name} getting audit stats (${days} days)`);

        const stats = await this.auditService.getAuditStats(days);

        return c.json({
          success: true,
          data: stats,
        });

      } catch (error) {
        console.error('Error getting audit stats:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar estatísticas de auditoria',
        }, 500);
      }
    });

    // Obter estatísticas de segurança
    this.app.get('/security-stats', async (c) => {
      try {
        const user = c.get('user');

        console.log(`🚨 Admin ${user?.name} getting security stats`);

        const stats = await this.auditService.getSecurityStats();

        return c.json({
          success: true,
          data: stats,
        });

      } catch (error) {
        console.error('Error getting security stats:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar estatísticas de segurança',
        }, 500);
      }
    });

    // Detectar atividades suspeitas
    this.app.get('/suspicious-activity', async (c) => {
      try {
        const user = c.get('user');

        console.log(`🔍 Admin ${user?.name} checking for suspicious activity`);

        const suspicious = await this.auditService.detectSuspiciousActivity();

        return c.json({
          success: true,
          data: suspicious,
        });

      } catch (error) {
        console.error('Error detecting suspicious activity:', error);
        return c.json({
          success: false,
          error: 'Erro ao detectar atividades suspeitas',
        }, 500);
      }
    });

    // Limpeza de logs antigos
    this.app.post('/cleanup', zValidator('json', cleanupLogsSchema), async (c) => {
      try {
        const user = c.get('user');
        const { auditLogsDays, securityEventsDays } = c.req.valid('json');

        console.log(`🧹 Admin ${user?.name} cleaning up old logs (audit: ${auditLogsDays}d, security: ${securityEventsDays}d)`);

        const result = await this.auditService.cleanupOldLogs(auditLogsDays, securityEventsDays);

        return c.json({
          success: true,
          message: `Limpeza concluída: ${result.auditLogsDeleted} logs de auditoria e ${result.securityEventsDeleted} eventos de segurança removidos`,
          data: result,
        });

      } catch (error) {
        console.error('Error cleaning up logs:', error);
        return c.json({
          success: false,
          error: 'Erro na limpeza de logs',
        }, 500);
      }
    });

    // Exportar logs (CSV)
    this.app.get('/export/logs', async (c) => {
      try {
        const user = c.get('user');
        const startDate = c.req.query('startDate');
        const endDate = c.req.query('endDate');
        const format = c.req.query('format') || 'json';

        console.log(`📥 Admin ${user?.name} exporting audit logs (${format})`);

        const result = await this.auditService.getAuditLogs({
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          limit: 10000, // Export limit
        });

        if (format === 'csv') {
          // Gerar CSV
          const headers = ['Data', 'Usuário', 'Ação', 'Recurso', 'Sucesso', 'IP', 'User Agent'];
          const csvRows = [headers.join(',')];

          result.logs.forEach(log => {
            const row = [
              log.createdAt,
              log.userName || log.userEmail || 'N/A',
              log.action,
              log.resource || 'N/A',
              log.success ? 'Sim' : 'Não',
              log.ipAddress,
              log.userAgent || 'N/A',
            ];
            csvRows.push(row.map(field => `"${field}"`).join(','));
          });

          const csvContent = csvRows.join('\n');

          c.header('Content-Type', 'text/csv');
          c.header('Content-Disposition', 'attachment; filename="audit-logs.csv"');
          return c.text(csvContent);
        }

        return c.json({
          success: true,
          data: result.logs,
          total: result.total,
          exportedAt: new Date().toISOString(),
          exportedBy: user?.name || user?.email,
        });

      } catch (error) {
        console.error('Error exporting logs:', error);
        return c.json({
          success: false,
          error: 'Erro ao exportar logs',
        }, 500);
      }
    });

    // Health check
    this.app.get('/health', async (c) => {
      try {
        const stats = await this.auditService.getAuditStats(1); // Last day
        const securityStats = await this.auditService.getSecurityStats();

        return c.json({
          success: true,
          service: 'audit',
          status: 'healthy',
          data: {
            auditLogsToday: stats.totalLogs,
            securityEventsUnresolved: securityStats.unresolvedEvents,
            recentSecurityEvents: securityStats.recentEvents,
            components: {
              auditLogs: true,
              securityEvents: true,
              suspiciousActivityDetection: true,
              logCleanup: true,
            },
          },
        });

      } catch (error) {
        console.error('Audit service health check failed:', error);
        return c.json({
          success: false,
          service: 'audit',
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