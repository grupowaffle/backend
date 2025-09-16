import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDrizzleClient } from '../../config/db';
import { AnalyticsRepository } from '../../repositories';
import { Env } from '../../config/types/common';

// Validation schemas
const analyticsFiltersSchema = z.object({
  source: z.enum(['manual', 'beehiiv']).optional(),
  categoryId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  days: z.string().transform(val => parseInt(val) || 30).optional(),
});

const articleAnalyticsSchema = z.object({
  articleId: z.string().min(1),
});

export class AnalyticsController {
  private app: Hono;
  private env: Env;
  private analyticsRepository: AnalyticsRepository;

  constructor(env: Env) {
    this.app = new Hono();
    this.env = env;
    
    const db = getDrizzleClient(env);
    this.analyticsRepository = new AnalyticsRepository(db);
    
    this.setupRoutes();
  }

  private setupRoutes() {
    // Dashboard principal com métricas gerais
    this.app.get('/dashboard', zValidator('query', analyticsFiltersSchema), async (c) => {
      try {
        const { source, categoryId, startDate, endDate } = c.req.valid('query');

        console.log('📊 Analytics: Fetching dashboard metrics');

        // For now, return basic metrics without analytics table
        const basicMetrics = {
          totalArticles: 0,
          totalViews: 0,
          totalLikes: 0,
          totalShares: 0,
          message: 'Analytics table not yet populated. Basic tracking is working.',
        };

        return c.json({
          success: true,
          data: {
            engagement: basicMetrics,
            topArticles: [],
            dailyMetrics: [],
            categoryPerformance: [],
            authorPerformance: [],
          },
        });

      } catch (error) {
        console.error('❌ Error fetching dashboard metrics:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch dashboard metrics',
        }, 500);
      }
    });

    // Comparação entre artigos manuais e BeehIV
    this.app.get('/comparison', async (c) => {
      try {
        console.log('📊 Analytics: Fetching source comparison');

        const comparison = await this.analyticsRepository.getSourceComparison();

        return c.json({
          success: true,
          data: comparison,
        });

      } catch (error) {
        console.error('❌ Error fetching source comparison:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch source comparison',
        }, 500);
      }
    });

    // Métricas de um artigo específico
    this.app.get('/articles/:articleId', zValidator('param', articleAnalyticsSchema), async (c) => {
      try {
        const { articleId } = c.req.valid('param');

        console.log('📊 Analytics: Fetching article analytics for:', articleId);

        const analytics = await this.analyticsRepository.getArticleAnalytics(articleId);

        if (!analytics) {
          return c.json({
            success: false,
            error: 'Analytics not found for this article',
          }, 404);
        }

        return c.json({
          success: true,
          data: analytics,
        });

      } catch (error) {
        console.error('❌ Error fetching article analytics:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch article analytics',
        }, 500);
      }
    });

    // Top artigos por engajamento
    this.app.get('/top-articles', zValidator('query', z.object({
      limit: z.string().transform(val => parseInt(val) || 10).optional(),
      source: z.enum(['manual', 'beehiiv']).optional(),
    })), async (c) => {
      try {
        const { limit, source } = c.req.valid('query');

        console.log('📊 Analytics: Fetching top articles');

        const filters: any = {};
        if (source) filters.source = source;

        const topArticles = await this.analyticsRepository.getTopArticles(limit, filters);

        return c.json({
          success: true,
          data: topArticles.map(item => ({
            id: item.article.id,
            title: item.article.title,
            slug: item.article.slug,
            views: item.analytics?.views || 0,
            likes: item.analytics?.likes || 0,
            shares: item.analytics?.shares || 0,
            avgTimeOnPage: item.analytics?.avgTimeOnPage || 0,
            bounceRate: item.analytics?.bounceRate || 0,
            source: item.article.source,
            publishedAt: item.article.publishedAt,
          })),
        });

      } catch (error) {
        console.error('❌ Error fetching top articles:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch top articles',
        }, 500);
      }
    });

    // Métricas diárias
    this.app.get('/daily', zValidator('query', z.object({
      days: z.string().transform(val => parseInt(val) || 30).optional(),
    })), async (c) => {
      try {
        const { days } = c.req.valid('query');

        console.log('📊 Analytics: Fetching daily metrics for', days, 'days');

        const dailyMetrics = await this.analyticsRepository.getDailyMetrics(days);

        return c.json({
          success: true,
          data: dailyMetrics,
        });

      } catch (error) {
        console.error('❌ Error fetching daily metrics:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch daily metrics',
        }, 500);
      }
    });

    // Performance por categoria
    this.app.get('/categories', async (c) => {
      try {
        console.log('📊 Analytics: Fetching category performance');

        const categoryPerformance = await this.analyticsRepository.getCategoryPerformance();

        return c.json({
          success: true,
          data: categoryPerformance,
        });

      } catch (error) {
        console.error('❌ Error fetching category performance:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch category performance',
        }, 500);
      }
    });

    // Performance por autor
    this.app.get('/authors', async (c) => {
      try {
        console.log('📊 Analytics: Fetching author performance');

        const authorPerformance = await this.analyticsRepository.getAuthorPerformance();

        return c.json({
          success: true,
          data: authorPerformance,
        });

      } catch (error) {
        console.error('❌ Error fetching author performance:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch author performance',
        }, 500);
      }
    });

    // Atualizar métricas de um artigo
    this.app.put('/articles/:articleId', zValidator('param', articleAnalyticsSchema), async (c) => {
      try {
        const { articleId } = c.req.valid('param');
        const updateData = await c.req.json();

        console.log('📊 Analytics: Updating article analytics for:', articleId);

        const analytics = await this.analyticsRepository.createOrUpdateAnalytics(articleId, updateData);

        return c.json({
          success: true,
          data: analytics,
        });

      } catch (error) {
        console.error('❌ Error updating article analytics:', error);
        return c.json({
          success: false,
          error: 'Failed to update article analytics',
        }, 500);
      }
    });
  }

  getApp() {
    return this.app;
  }
}