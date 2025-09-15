/**
 * Serviço de dashboard editorial
 * Agrega métricas e dados para o painel de controle editorial
 */

import { DatabaseType } from '../repositories/BaseRepository';
import { WorkflowService } from './WorkflowService';
import { NotificationService } from './NotificationService';
import { ArticleRepository } from '../repositories/ArticleRepository';
import { eq, desc, count, sql, and, gte, lte } from 'drizzle-orm';
import { articles, workflowHistory, users } from '../config/db/schema';

export interface DashboardOverview {
  articlesOverview: {
    total: number;
    published: number;
    inReview: number;
    approved: number;
    drafts: number;
    beehiivPending: number;
    rejected: number;
  };
  todayStats: {
    published: number;
    reviewed: number;
    created: number;
    beehiivImported: number;
  };
  weeklyStats: {
    published: number;
    reviewed: number;
    created: number;
    imported: number;
  };
  topPerformers: {
    articles: Array<{
      id: string;
      title: string;
      views: number;
      likes: number;
      shares: number;
      publishedAt: Date;
    }>;
    authors: Array<{
      id: string;
      name: string;
      articlesCount: number;
      totalViews: number;
    }>;
  };
  recentActivity: Array<{
    type: 'article_created' | 'article_published' | 'status_changed' | 'beehiiv_imported';
    timestamp: Date;
    title: string;
    description: string;
    user?: string;
    articleId?: string;
  }>;
}

export interface EditorialMetrics {
  workflow: {
    averageApprovalTime: number; // hours
    rejectionRate: number; // percentage
    publishingVelocity: number; // articles per day
    bottlenecks: Array<{
      status: string;
      count: number;
      averageTime: number;
    }>;
  };
  content: {
    totalWords: number;
    averageReadingTime: number;
    topCategories: Array<{
      name: string;
      count: number;
      percentage: number;
    }>;
    sourceBreakdown: {
      manual: number;
      beehiiv: number;
    };
  };
  engagement: {
    totalViews: number;
    totalLikes: number;
    totalShares: number;
    averageEngagement: number;
    topArticles: Array<{
      id: string;
      title: string;
      views: number;
      engagementRate: number;
    }>;
  };
}

export interface UserDashboard {
  personalStats: {
    articlesWritten: number;
    articlesPublished: number;
    totalViews: number;
    averageViews: number;
  };
  myArticles: {
    drafts: any[];
    inReview: any[];
    published: any[];
    rejected: any[];
  };
  assignedToMe: any[];
  recentNotifications: any[];
  quickActions: Array<{
    label: string;
    url: string;
    icon: string;
    count?: number;
  }>;
}

export class DashboardService {
  private db: DatabaseType;
  private workflowService: WorkflowService;
  private notificationService: NotificationService;
  private articleRepository: ArticleRepository;

  constructor(db: DatabaseType) {
    this.db = db;
    this.workflowService = new WorkflowService(db);
    this.notificationService = new NotificationService(db);
    this.articleRepository = new ArticleRepository(db);
  }

  /**
   * Obter visão geral do dashboard para admins/editores-chefe
   */
  async getDashboardOverview(): Promise<DashboardOverview> {
    try {
      console.log('📊 Generating dashboard overview...');

      // Visão geral dos artigos por status
      const articlesOverview = await this.getArticlesOverview();
      
      // Estatísticas de hoje
      const todayStats = await this.getTodayStats();
      
      // Estatísticas da semana
      const weeklyStats = await this.getWeeklyStats();
      
      // Top performers
      const topPerformers = await this.getTopPerformers();
      
      // Atividade recente
      const recentActivity = await this.getRecentActivity();

      return {
        articlesOverview,
        todayStats,
        weeklyStats,
        topPerformers,
        recentActivity,
      };
    } catch (error) {
      console.error('Error generating dashboard overview:', error);
      throw error;
    }
  }

  /**
   * Obter métricas editoriais detalhadas
   */
  async getEditorialMetrics(): Promise<EditorialMetrics> {
    try {
      console.log('📈 Generating editorial metrics...');

      // Métricas de workflow
      const workflowStats = await this.workflowService.getWorkflowStats();
      
      // Métricas de conteúdo
      const contentMetrics = await this.getContentMetrics();
      
      // Métricas de engajamento
      const engagementMetrics = await this.getEngagementMetrics();

      return {
        workflow: {
          averageApprovalTime: workflowStats.averageApprovalTime,
          rejectionRate: workflowStats.rejectionRate,
          publishingVelocity: await this.getPublishingVelocity(),
          bottlenecks: await this.getWorkflowBottlenecks(),
        },
        content: contentMetrics,
        engagement: engagementMetrics,
      };
    } catch (error) {
      console.error('Error generating editorial metrics:', error);
      throw error;
    }
  }

  /**
   * Obter dashboard personalizado do usuário
   */
  async getUserDashboard(userId: string, userRole: string): Promise<UserDashboard> {
    try {
      console.log(`👤 Generating user dashboard for ${userId} (${userRole})`);

      // Estatísticas pessoais
      const personalStats = await this.getUserPersonalStats(userId);
      
      // Meus artigos por status
      const myArticles = await this.getUserArticlesByStatus(userId);
      
      // Artigos atribuídos a mim (se for revisor/editor-chefe)
      const assignedToMe = await this.getArticlesAssignedToUser(userId, userRole);
      
      // Notificações recentes
      const notifications = await this.notificationService.getUserNotifications(userId, { limit: 5 });
      
      // Ações rápidas baseadas no role
      const quickActions = this.getQuickActionsForRole(userRole, personalStats);

      return {
        personalStats,
        myArticles,
        assignedToMe,
        recentNotifications: notifications.notifications,
        quickActions,
      };
    } catch (error) {
      console.error('Error generating user dashboard:', error);
      throw error;
    }
  }

  /**
   * Visão geral dos artigos por status
   */
  private async getArticlesOverview() {
    const statusCounts = await this.db
      .select({
        status: articles.status,
        count: count(),
      })
      .from(articles)
      .groupBy(articles.status);

    const overview = {
      total: 0,
      published: 0,
      inReview: 0,
      approved: 0,
      drafts: 0,
      beehiivPending: 0,
      rejected: 0,
    };

    statusCounts.forEach(({ status, count }) => {
      const countNum = Number(count);
      overview.total += countNum;

      switch (status) {
        case 'published':
          overview.published = countNum;
          break;
        case 'review':
          overview.inReview = countNum;
          break;
        case 'approved':
          overview.approved = countNum;
          break;
        case 'draft':
          overview.drafts = countNum;
          break;
        case 'beehiiv_pending':
          overview.beehiivPending = countNum;
          break;
        case 'rejected':
          overview.rejected = countNum;
          break;
      }
    });

    return overview;
  }

  /**
   * Estatísticas de hoje
   */
  private async getTodayStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [stats] = await this.db
      .select({
        published: count(sql`CASE WHEN ${articles.status} = 'published' AND ${articles.publishedAt} >= ${today} AND ${articles.publishedAt} < ${tomorrow} THEN 1 END`),
        created: count(sql`CASE WHEN ${articles.createdAt} >= ${today} AND ${articles.createdAt} < ${tomorrow} THEN 1 END`),
        beehiivImported: count(sql`CASE WHEN ${articles.source} = 'beehiiv' AND ${articles.createdAt} >= ${today} AND ${articles.createdAt} < ${tomorrow} THEN 1 END`),
      })
      .from(articles);

    // Artigos revisados hoje (histórico de workflow)
    const [reviewedToday] = await this.db
      .select({
        reviewed: count(),
      })
      .from(workflowHistory)
      .where(
        and(
          sql`${workflowHistory.toStatus} IN ('approved', 'rejected')`,
          gte(workflowHistory.createdAt, today),
          lte(workflowHistory.createdAt, tomorrow)
        )
      );

    return {
      published: Number(stats.published),
      reviewed: Number(reviewedToday.reviewed),
      created: Number(stats.created),
      beehiivImported: Number(stats.beehiivImported),
    };
  }

  /**
   * Estatísticas da semana
   */
  private async getWeeklyStats() {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [stats] = await this.db
      .select({
        published: count(sql`CASE WHEN ${articles.status} = 'published' AND ${articles.publishedAt} >= ${weekAgo} THEN 1 END`),
        created: count(sql`CASE WHEN ${articles.createdAt} >= ${weekAgo} THEN 1 END`),
        imported: count(sql`CASE WHEN ${articles.source} = 'beehiiv' AND ${articles.createdAt} >= ${weekAgo} THEN 1 END`),
      })
      .from(articles);

    const [reviewedWeek] = await this.db
      .select({
        reviewed: count(),
      })
      .from(workflowHistory)
      .where(
        and(
          sql`${workflowHistory.toStatus} IN ('approved', 'rejected')`,
          gte(workflowHistory.createdAt, weekAgo)
        )
      );

    return {
      published: Number(stats.published),
      reviewed: Number(reviewedWeek.reviewed),
      created: Number(stats.created),
      imported: Number(stats.imported),
    };
  }

  /**
   * Top performers
   */
  private async getTopPerformers() {
    // Top artigos por views
    const topArticles = await this.db
      .select({
        id: articles.id,
        title: articles.title,
        views: articles.views,
        likes: articles.likes,
        shares: articles.shares,
        publishedAt: articles.publishedAt,
      })
      .from(articles)
      .where(eq(articles.status, 'published'))
      .orderBy(desc(articles.views))
      .limit(5);

    // Top autores por quantidade de artigos
    const topAuthors = await this.db
      .select({
        id: articles.authorId,
        articlesCount: count(),
        totalViews: sql<number>`sum(${articles.views})`,
      })
      .from(articles)
      .where(eq(articles.status, 'published'))
      .groupBy(articles.authorId)
      .orderBy(desc(count()))
      .limit(5);

    // Buscar nomes dos autores
    const authorsWithNames = [];
    for (const author of topAuthors) {
      if (author.id) {
        const [user] = await this.db
          .select({ name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, author.id))
          .limit(1);

        authorsWithNames.push({
          id: author.id,
          name: user?.name || user?.email || 'Usuário desconhecido',
          articlesCount: Number(author.articlesCount),
          totalViews: Number(author.totalViews),
        });
      }
    }

    return {
      articles: topArticles.map(article => ({
        ...article,
        views: Number(article.views || 0),
        likes: Number(article.likes || 0),
        shares: Number(article.shares || 0),
      })),
      authors: authorsWithNames,
    };
  }

  /**
   * Atividade recente
   */
  private async getRecentActivity(limit = 10) {
    const recentArticles = await this.db
      .select({
        id: articles.id,
        title: articles.title,
        status: articles.status,
        createdAt: articles.createdAt,
        publishedAt: articles.publishedAt,
        source: articles.source,
        authorId: articles.authorId,
      })
      .from(articles)
      .orderBy(desc(articles.updatedAt))
      .limit(limit);

    const activity = [];

    for (const article of recentArticles) {
      let authorName = 'Sistema';
      
      if (article.authorId) {
        const [user] = await this.db
          .select({ name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, article.authorId))
          .limit(1);
        
        authorName = user?.name || user?.email || 'Usuário desconhecido';
      }

      if (article.status === 'published' && article.publishedAt) {
        activity.push({
          type: 'article_published' as const,
          timestamp: article.publishedAt,
          title: article.title,
          description: `Artigo publicado por ${authorName}`,
          user: authorName,
          articleId: article.id,
        });
      } else if (article.source === 'beehiiv') {
        activity.push({
          type: 'beehiiv_imported' as const,
          timestamp: article.createdAt,
          title: article.title,
          description: 'Novo conteúdo importado do BeehIiv',
          articleId: article.id,
        });
      } else {
        activity.push({
          type: 'article_created' as const,
          timestamp: article.createdAt,
          title: article.title,
          description: `Artigo criado por ${authorName}`,
          user: authorName,
          articleId: article.id,
        });
      }
    }

    return activity.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Métricas de conteúdo
   */
  private async getContentMetrics() {
    const [contentStats] = await this.db
      .select({
        totalViews: sql<number>`sum(${articles.views})`,
        totalShares: sql<number>`sum(${articles.shares})`,
        totalLikes: sql<number>`sum(${articles.likes})`,
        manualCount: count(sql`CASE WHEN ${articles.source} = 'manual' THEN 1 END`),
        beehiivCount: count(sql`CASE WHEN ${articles.source} = 'beehiiv' THEN 1 END`),
      })
      .from(articles)
      .where(eq(articles.status, 'published'));

    return {
      totalViews: Number(contentStats.totalViews || 0),
      totalShares: Number(contentStats.totalShares || 0),
      totalLikes: Number(contentStats.totalLikes || 0),
      topCategories: [], // TODO: implementar quando categorias estiverem associadas
      sourceBreakdown: {
        manual: Number(contentStats.manualCount),
        beehiiv: Number(contentStats.beehiivCount),
      },
    };
  }

  /**
   * Métricas de engajamento
   */
  private async getEngagementMetrics() {
    const [engagement] = await this.db
      .select({
        totalViews: sql<number>`sum(${articles.views})`,
        totalLikes: sql<number>`sum(${articles.likes})`,
        totalShares: sql<number>`sum(${articles.shares})`,
        articleCount: count(),
      })
      .from(articles)
      .where(eq(articles.status, 'published'));

    const topArticles = await this.db
      .select({
        id: articles.id,
        title: articles.title,
        views: articles.views,
        likes: articles.likes,
        shares: articles.shares,
      })
      .from(articles)
      .where(eq(articles.status, 'published'))
      .orderBy(desc(sql`${articles.views} + ${articles.likes} * 2 + ${articles.shares} * 3`))
      .limit(5);

    const totalViews = Number(engagement.totalViews || 0);
    const totalInteractions = Number(engagement.totalLikes || 0) + Number(engagement.totalShares || 0);
    const averageEngagement = totalViews > 0 ? (totalInteractions / totalViews) * 100 : 0;

    return {
      totalViews,
      totalLikes: Number(engagement.totalLikes || 0),
      totalShares: Number(engagement.totalShares || 0),
      averageEngagement: Math.round(averageEngagement * 100) / 100,
      topArticles: topArticles.map(article => ({
        id: article.id,
        title: article.title,
        views: Number(article.views || 0),
        engagementRate: Number(article.views || 0) > 0 
          ? (((Number(article.likes || 0) + Number(article.shares || 0)) / Number(article.views || 0)) * 100)
          : 0,
      })),
    };
  }

  /**
   * Velocidade de publicação
   */
  private async getPublishingVelocity(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [published] = await this.db
      .select({
        count: count(),
      })
      .from(articles)
      .where(
        and(
          eq(articles.status, 'published'),
          gte(articles.publishedAt, thirtyDaysAgo)
        )
      );

    return Number(published.count) / 30; // artigos por dia
  }

  /**
   * Gargalos do workflow
   */
  private async getWorkflowBottlenecks() {
    // Simplified bottleneck detection
    const statusCounts = await this.db
      .select({
        status: articles.status,
        count: count(),
      })
      .from(articles)
      .where(sql`${articles.status} IN ('review', 'approved', 'beehiiv_pending')`)
      .groupBy(articles.status);

    return statusCounts.map(({ status, count }) => ({
      status,
      count: Number(count),
      averageTime: 24, // TODO: calcular tempo médio real
    }));
  }

  /**
   * Estatísticas pessoais do usuário
   */
  private async getUserPersonalStats(userId: string) {
    const [stats] = await this.db
      .select({
        articlesWritten: count(),
        articlesPublished: count(sql`CASE WHEN ${articles.status} = 'published' THEN 1 END`),
        totalViews: sql<number>`sum(${articles.views})`,
      })
      .from(articles)
      .where(eq(articles.authorId, userId));

    const articlesPublished = Number(stats.articlesPublished);
    const totalViews = Number(stats.totalViews || 0);

    return {
      articlesWritten: Number(stats.articlesWritten),
      articlesPublished,
      totalViews,
      averageViews: articlesPublished > 0 ? Math.round(totalViews / articlesPublished) : 0,
    };
  }

  /**
   * Artigos do usuário por status
   */
  private async getUserArticlesByStatus(userId: string) {
    const drafts = await this.workflowService.getArticlesByStatus('draft', { userId, limit: 5 });
    const inReview = await this.workflowService.getArticlesByStatus('review', { userId, limit: 5 });
    const published = await this.workflowService.getArticlesByStatus('published', { userId, limit: 5 });
    const rejected = await this.workflowService.getArticlesByStatus('rejected', { userId, limit: 5 });

    return {
      drafts: drafts.articles,
      inReview: inReview.articles,
      published: published.articles,
      rejected: rejected.articles,
    };
  }

  /**
   * Artigos atribuídos ao usuário
   */
  private async getArticlesAssignedToUser(userId: string, userRole: string) {
    if (!['revisor', 'editor-chefe', 'admin'].includes(userRole)) {
      return [];
    }

    const assigned = await this.workflowService.getArticlesByStatus(
      ['review', 'beehiiv_pending'], 
      { assignedTo: userId, limit: 10 }
    );

    return assigned.articles;
  }

  /**
   * Ações rápidas baseadas no role
   */
  private getQuickActionsForRole(userRole: string, personalStats: any) {
    const actions = [
      {
        label: 'Criar artigo',
        url: '/articles/new',
        icon: '✏️',
      },
      {
        label: 'Meus rascunhos',
        url: '/articles?status=draft',
        icon: '📝',
        count: personalStats.drafts?.length,
      },
    ];

    if (['editor', 'editor-chefe', 'admin'].includes(userRole)) {
      actions.push({
        label: 'Em revisão',
        url: '/articles?status=review',
        icon: '👀',
      });
    }

    if (['editor-chefe', 'admin'].includes(userRole)) {
      actions.push(
        {
          label: 'Aprovar artigos',
          url: '/articles?status=approved',
          icon: '✅',
        },
        {
          label: 'Dashboard completo',
          url: '/dashboard',
          icon: '📊',
        }
      );
    }

    if (userRole === 'admin') {
      actions.push({
        label: 'Configurações',
        url: '/settings',
        icon: '⚙️',
      });
    }

    return actions;
  }
}