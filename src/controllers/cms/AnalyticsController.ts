import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { AnalyticsService } from '../../services/AnalyticsService';
import { getDrizzleClient } from '../../config/db';
import { Env } from '../../config/types/common';
import { authMiddleware } from '../../middlewares/auth';

// Validation schemas
const trackEventSchema = z.object({
  eventType: z.string().min(1, 'Event type é obrigatório'),
  eventCategory: z.string().min(1, 'Event category é obrigatória'),
  eventAction: z.string().min(1, 'Event action é obrigatória'),
  eventLabel: z.string().optional(),
  articleId: z.string().optional(),
  categoryId: z.string().optional(),
  sessionId: z.string().min(1, 'Session ID é obrigatório'),
  visitorId: z.string().min(1, 'Visitor ID é obrigatório'),
  deviceType: z.enum(['mobile', 'desktop', 'tablet']).optional(),
  browser: z.string().optional(),
  os: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  referrer: z.string().optional(),
  referrerDomain: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  value: z.number().optional(),
  duration: z.number().optional(),
  metadata: z.record(z.any()).optional(),
});

const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const articleMetricsSchema = z.object({
  articleId: z.string().min(1, 'Article ID é obrigatório'),
}).merge(dateRangeSchema);

const topArticlesSchema = z.object({
  limit: z.string().transform(val => Math.min(50, Math.max(1, parseInt(val) || 10))).default('10'),
}).merge(dateRangeSchema);

const dashboardMetricsSchema = dateRangeSchema;

export class AnalyticsController {
  private app: Hono;
  private analyticsService: AnalyticsService;

  constructor(env: Env) {
    this.app = new Hono();
    const db = getDrizzleClient(env);
    this.analyticsService = new AnalyticsService(db);
    this.setupRoutes();
  }

  private setupRoutes() {
    // Tracking endpoint (público para permitir tracking do frontend)
    this.app.post('/track', zValidator('json', trackEventSchema), async (c) => {
      try {
        const eventData = c.req.valid('json');

        // Adicionar dados do request
        const trackingData = {
          ...eventData,
          userAgent: c.req.header('User-Agent'),
          ipAddress: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown',
        };

        await this.analyticsService.trackEvent(trackingData);

        return c.json({
          success: true,
          message: 'Event tracked successfully',
        });

      } catch (error) {
        console.error('Error tracking analytics event:', error);
        // Não retornar erro para não afetar UX
        return c.json({
          success: true, // Sempre retornar success para tracking
          message: 'Event processed',
        });
      }
    });

    // Middleware de autenticação para rotas protegidas
    this.app.use('/dashboard/*', authMiddleware);
    this.app.use('/article/*', authMiddleware);
    this.app.use('/insights/*', authMiddleware);
    this.app.use('/performance/*', authMiddleware);

    // Dashboard metrics
    this.app.get('/dashboard/metrics', zValidator('query', dashboardMetricsSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Verificar permissões (editores+ podem ver analytics)
        if (!['admin', 'editor-chefe', 'editor'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Permissão insuficiente para ver analytics',
          }, 403);
        }

        const { startDate, endDate } = c.req.valid('query');

        console.log(`📊 Getting dashboard metrics for ${user.name}`);

        const dateRange = startDate && endDate ? {
          start: new Date(startDate),
          end: new Date(endDate),
        } : undefined;

        const metrics = await this.analyticsService.getDashboardMetrics(dateRange);

        return c.json({
          success: true,
          data: metrics,
        });

      } catch (error) {
        console.error('Error getting dashboard metrics:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar métricas do dashboard',
        }, 500);
      }
    });

    // Article metrics
    this.app.get('/article/metrics', zValidator('query', articleMetricsSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const { articleId, startDate, endDate } = c.req.valid('query');

        console.log(`📊 Getting article metrics for ${articleId} by ${user.name}`);

        const dateRange = startDate && endDate ? {
          start: new Date(startDate),
          end: new Date(endDate),
        } : undefined;

        const metrics = await this.analyticsService.getArticleMetrics(articleId, dateRange);

        if (metrics) {
          return c.json({
            success: true,
            data: metrics,
          });
        } else {
          return c.json({
            success: false,
            error: 'Métricas do artigo não encontradas',
          }, 404);
        }

      } catch (error) {
        console.error('Error getting article metrics:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar métricas do artigo',
        }, 500);
      }
    });

    // Top articles
    this.app.get('/article/top', zValidator('query', topArticlesSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const { limit, startDate, endDate } = c.req.valid('query');

        console.log(`📊 Getting top ${limit} articles for ${user.name}`);

        const dateRange = startDate && endDate ? {
          start: new Date(startDate),
          end: new Date(endDate),
        } : undefined;

        const topArticles = await this.analyticsService.getTopArticles(limit, dateRange);

        return c.json({
          success: true,
          data: topArticles,
        });

      } catch (error) {
        console.error('Error getting top articles:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar top artigos',
        }, 500);
      }
    });

    // User behavior insights
    this.app.get('/insights/user/:visitorId', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Apenas admins e editores-chefe podem ver insights detalhados de usuário
        if (!['admin', 'editor-chefe'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Apenas administradores e editores-chefe podem ver insights de usuário',
          }, 403);
        }

        const visitorId = c.req.param('visitorId');

        console.log(`🔍 Getting user behavior insights for visitor ${visitorId}`);

        const insights = await this.analyticsService.getUserBehaviorInsights(visitorId);

        if (insights) {
          return c.json({
            success: true,
            data: insights,
          });
        } else {
          return c.json({
            success: false,
            error: 'Insights do usuário não encontrados',
          }, 404);
        }

      } catch (error) {
        console.error('Error getting user behavior insights:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar insights do usuário',
        }, 500);
      }
    });

    // Content performance insights
    this.app.get('/insights/content/:articleId', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const articleId = c.req.param('articleId');

        console.log(`📈 Getting content performance insights for article ${articleId}`);

        const insights = await this.analyticsService.getContentPerformanceInsights(articleId);

        if (insights) {
          return c.json({
            success: true,
            data: insights,
          });
        } else {
          return c.json({
            success: false,
            error: 'Insights de performance não encontrados',
          }, 404);
        }

      } catch (error) {
        console.error('Error getting content performance insights:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar insights de performance',
        }, 500);
      }
    });

    // Calculate performance score
    this.app.post('/performance/calculate/:articleId', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const articleId = c.req.param('articleId');

        console.log(`⚙️ Calculating performance score for article ${articleId} by ${user.name}`);

        const score = await this.analyticsService.calculatePerformanceScore(articleId);

        return c.json({
          success: true,
          data: {
            articleId,
            performanceScore: score,
            calculatedAt: new Date().toISOString(),
          },
        });

      } catch (error) {
        console.error('Error calculating performance score:', error);
        return c.json({
          success: false,
          error: 'Erro ao calcular score de performance',
        }, 500);
      }
    });

    // Real-time analytics (última hora)
    this.app.get('/realtime', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        console.log(`⚡ Getting real-time analytics for ${user.name}`);

        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        const realtimeMetrics = await this.analyticsService.getDashboardMetrics({
          start: oneHourAgo,
          end: now,
        });

        return c.json({
          success: true,
          data: {
            ...realtimeMetrics.realTime,
            timestamp: now.toISOString(),
            timeRange: {
              start: oneHourAgo.toISOString(),
              end: now.toISOString(),
            },
          },
        });

      } catch (error) {
        console.error('Error getting real-time analytics:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar analytics em tempo real',
        }, 500);
      }
    });

    // Analytics para um artigo específico (público para widgets)
    this.app.get('/public/article/:articleId/basic', async (c) => {
      try {
        const articleId = c.req.param('articleId');

        console.log(`📊 Getting basic public metrics for article ${articleId}`);

        const metrics = await this.analyticsService.getArticleMetrics(articleId);

        if (metrics) {
          // Retornar apenas métricas básicas públicas
          return c.json({
            success: true,
            data: {
              articleId: metrics.articleId,
              views: metrics.views,
              likes: metrics.likes,
              shares: metrics.shares,
              comments: metrics.comments,
              performanceScore: metrics.performanceScore,
            },
          });
        } else {
          return c.json({
            success: false,
            error: 'Artigo não encontrado',
          }, 404);
        }

      } catch (error) {
        console.error('Error getting public article metrics:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar métricas públicas',
        }, 500);
      }
    });

    // Analytics dashboard para embed (iframe)
    this.app.get('/embed/dashboard', async (c) => {
      try {
        const apiKey = c.req.query('api_key');
        
        // TODO: Implementar validação de API key para embeds
        if (!apiKey) {
          return c.json({
            success: false,
            error: 'API key é obrigatória para embed',
          }, 401);
        }

        console.log(`🔗 Getting embed dashboard metrics`);

        const metrics = await this.analyticsService.getDashboardMetrics();

        // Retornar dados simplificados para embed
        return c.json({
          success: true,
          data: {
            totalViews: metrics.overview.totalViews,
            totalArticles: metrics.overview.totalArticles,
            topArticles: metrics.realTime.topArticlesNow.slice(0, 5),
            trafficSources: metrics.realTime.currentTrafficSources,
          },
        });

      } catch (error) {
        console.error('Error getting embed dashboard:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar dashboard embed',
        }, 500);
      }
    });

    // Health check
    this.app.get('/health', async (c) => {
      try {
        // Testar funcionalidades básicas
        const testMetrics = await this.analyticsService.getDashboardMetrics({
          start: new Date(Date.now() - 24 * 60 * 60 * 1000),
          end: new Date(),
        });

        return c.json({
          success: true,
          service: 'analytics',
          status: 'healthy',
          data: {
            totalViewsLast24h: testMetrics.overview.totalViews,
            activeUsers: testMetrics.realTime.activeUsers,
            components: {
              eventTracking: true,
              metricsAggregation: true,
              performanceCalculation: true,
              dashboardMetrics: true,
              userBehaviorAnalysis: true,
            },
          },
        });

      } catch (error) {
        console.error('Analytics health check failed:', error);
        return c.json({
          success: false,
          service: 'analytics',
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