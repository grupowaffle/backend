import { Hono } from 'hono';
import { DashboardService } from '../../services/DashboardService';
import { getDrizzleClient } from '../../config/db';
import { Env } from '../../config/types/common';
import { authMiddleware } from '../../middlewares/auth';

export class DashboardController {
  private app: Hono;
  private dashboardService: DashboardService;

  constructor(env: Env) {
    this.app = new Hono();
    const db = getDrizzleClient(env);
    this.dashboardService = new DashboardService(db);
    this.setupRoutes();
  }

  private setupRoutes() {
    // Middleware de autenticação para todas as rotas
    this.app.use('*', authMiddleware);

    // Dashboard personalizado do usuário
    this.app.get('/', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        console.log(`📊 Getting user dashboard for ${user.name} (${user.role})`);

        const dashboard = await this.dashboardService.getUserDashboard(user.id, user.role);

        return c.json({
          success: true,
          data: dashboard,
        });
      } catch (error) {
        console.error('Error getting user dashboard:', error);
        return c.json({
          success: false,
          error: 'Erro ao carregar dashboard',
        }, 500);
      }
    });

    // Visão geral do dashboard (admin/editor-chefe apenas)
    this.app.get('/overview', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        if (!['admin', 'editor-chefe', 'developer'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Acesso negado. Apenas administradores, editores-chefe e desenvolvedores podem ver a visão geral.',
          }, 403);
        }

        console.log(`📈 Getting dashboard overview for ${user.name} (${user.role})`);

        const overview = await this.dashboardService.getDashboardOverview();

        return c.json({
          success: true,
          data: overview,
        });
      } catch (error) {
        console.error('Error getting dashboard overview:', error);
        return c.json({
          success: false,
          error: 'Erro ao carregar visão geral',
        }, 500);
      }
    });

    // Métricas editoriais detalhadas (admin apenas)
    this.app.get('/metrics', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        if (!['admin', 'developer'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Apenas administradores e desenvolvedores podem acessar métricas detalhadas',
          }, 403);
        }

        console.log(`📊 Getting editorial metrics for admin ${user.name}`);

        const metrics = await this.dashboardService.getEditorialMetrics();

        return c.json({
          success: true,
          data: metrics,
        });
      } catch (error) {
        console.error('Error getting editorial metrics:', error);
        return c.json({
          success: false,
          error: 'Erro ao carregar métricas editoriais',
        }, 500);
      }
    });

    // Estatísticas rápidas para header/sidebar
    this.app.get('/quick-stats', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        console.log(`⚡ Getting quick stats for ${user.name} (${user.role})`);

        // Para usuários normais, mostrar apenas suas estatísticas
        if (!['admin', 'editor-chefe'].includes(user.role)) {
          const userDashboard = await this.dashboardService.getUserDashboard(user.id, user.role);
          
          return c.json({
            success: true,
            data: {
              personalStats: userDashboard.personalStats,
              pendingReviews: userDashboard.assignedToMe.length,
              unreadNotifications: userDashboard.recentNotifications.filter(n => !n.isRead).length,
            },
          });
        }

        // Para admins/editores-chefe, mostrar visão geral
        const overview = await this.dashboardService.getDashboardOverview();
        
        return c.json({
          success: true,
          data: {
            totalArticles: overview.articlesOverview.total,
            publishedToday: overview.todayStats.published,
            inReview: overview.articlesOverview.inReview,
            beehiivPending: overview.articlesOverview.beehiivPending,
            approvedWaiting: overview.articlesOverview.approved,
          },
        });
      } catch (error) {
        console.error('Error getting quick stats:', error);
        return c.json({
          success: false,
          error: 'Erro ao carregar estatísticas rápidas',
        }, 500);
      }
    });

    // Atividade recente
    this.app.get('/activity', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const limit = parseInt(c.req.query('limit') || '20');

        console.log(`📝 Getting recent activity for ${user.name} (limit: ${limit})`);

        // Admins/editores-chefe veem toda atividade
        if (['admin', 'editor-chefe'].includes(user.role)) {
          const overview = await this.dashboardService.getDashboardOverview();
          
          return c.json({
            success: true,
            data: overview.recentActivity.slice(0, limit),
          });
        }

        // Outros usuários veem apenas atividade relacionada a eles
        const userDashboard = await this.dashboardService.getUserDashboard(user.id, user.role);
        
        // Converter artigos do usuário em atividade
        const userActivity = [];
        
        // Artigos publicados recentemente
        userDashboard.myArticles.published.slice(0, 5).forEach(article => {
          userActivity.push({
            type: 'article_published',
            timestamp: article.publishedAt || article.updatedAt,
            title: article.title,
            description: 'Seu artigo foi publicado',
            articleId: article.id,
          });
        });

        // Artigos em revisão
        userDashboard.myArticles.inReview.slice(0, 3).forEach(article => {
          userActivity.push({
            type: 'status_changed',
            timestamp: article.updatedAt,
            title: article.title,
            description: 'Artigo enviado para revisão',
            articleId: article.id,
          });
        });

        // Ordenar por timestamp
        userActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        return c.json({
          success: true,
          data: userActivity.slice(0, limit),
        });
      } catch (error) {
        console.error('Error getting recent activity:', error);
        return c.json({
          success: false,
          error: 'Erro ao carregar atividade recente',
        }, 500);
      }
    });

    // Health check do dashboard
    this.app.get('/health', async (c) => {
      try {
        const user = c.get('user');
        
        // Teste básico: buscar visão geral
        const overview = await this.dashboardService.getDashboardOverview();

        return c.json({
          success: true,
          service: 'dashboard',
          status: 'healthy',
          data: {
            totalArticles: overview.articlesOverview.total,
            userRole: user?.role,
            componentsWorking: {
              articlesOverview: true,
              todayStats: true,
              recentActivity: overview.recentActivity.length > 0,
            },
          },
        });
      } catch (error) {
        console.error('Dashboard health check failed:', error);
        return c.json({
          success: false,
          service: 'dashboard',
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 500);
      }
    });

    // Endpoint para dados em tempo real (WebSocket alternative)
    this.app.get('/realtime', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Dados que mudam frequentemente
        const quickStats = await this.dashboardService.getUserDashboard(user.id, user.role);
        
        // Se é admin/editor-chefe, incluir dados globais
        let globalData = null;
        if (['admin', 'editor-chefe'].includes(user.role)) {
          const overview = await this.dashboardService.getDashboardOverview();
          globalData = {
            inReview: overview.articlesOverview.inReview,
            approved: overview.articlesOverview.approved,
            beehiivPending: overview.articlesOverview.beehiivPending,
            publishedToday: overview.todayStats.published,
          };
        }

        return c.json({
          success: true,
          data: {
            timestamp: new Date().toISOString(),
            user: {
              unreadNotifications: quickStats.recentNotifications.filter(n => !n.isRead).length,
              assignedArticles: quickStats.assignedToMe.length,
              personalStats: quickStats.personalStats,
            },
            global: globalData,
          },
        });
      } catch (error) {
        console.error('Error getting realtime data:', error);
        return c.json({
          success: false,
          error: 'Erro ao carregar dados em tempo real',
        }, 500);
      }
    });

    // Exportar dados do dashboard (CSV/JSON)
    this.app.get('/export', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        if (!['admin', 'developer'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Apenas administradores e desenvolvedores podem exportar dados',
          }, 403);
        }

        const format = c.req.query('format') || 'json';
        
        console.log(`📥 Exporting dashboard data in ${format} format for admin ${user.name}`);

        const [overview, metrics] = await Promise.all([
          this.dashboardService.getDashboardOverview(),
          this.dashboardService.getEditorialMetrics(),
        ]);

        const exportData = {
          exportedAt: new Date().toISOString(),
          exportedBy: user.name || user.email,
          overview,
          metrics,
        };

        if (format === 'csv') {
          // Simplified CSV export
          const csvData = `Metric,Value
Total Articles,${overview.articlesOverview.total}
Published,${overview.articlesOverview.published}
In Review,${overview.articlesOverview.inReview}
Approved,${overview.articlesOverview.approved}
Rejection Rate,${metrics.workflow.rejectionRate}%
Publishing Velocity,${metrics.workflow.publishingVelocity}
Total Views,${metrics.engagement.totalViews}
Total Likes,${metrics.engagement.totalLikes}
Total Shares,${metrics.engagement.totalShares}`;

          c.header('Content-Type', 'text/csv');
          c.header('Content-Disposition', 'attachment; filename="dashboard-export.csv"');
          return c.text(csvData);
        }

        return c.json({
          success: true,
          data: exportData,
        });
      } catch (error) {
        console.error('Error exporting dashboard data:', error);
        return c.json({
          success: false,
          error: 'Erro ao exportar dados',
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