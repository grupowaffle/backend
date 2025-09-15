/**
 * Serviço de Analytics Interno
 * Sistema completo de monitoramento e análise de performance de conteúdo
 */

import { DatabaseType } from '../repositories/BaseRepository';
import { generateId } from '../lib/cuid';
import { eq, and, or, desc, asc, count, sum, avg, gte, lte, sql } from 'drizzle-orm';
import { 
  articles, articleAnalytics, analyticsEvents, userBehaviorAnalytics, 
  contentPerformanceAnalytics, categories, authors 
} from '../config/db/schema';

export interface AnalyticsEventData {
  eventType: string;
  eventCategory: string;
  eventAction: string;
  eventLabel?: string;
  articleId?: string;
  categoryId?: string;
  userId?: string;
  sessionId: string;
  visitorId: string;
  userAgent?: string;
  ipAddress: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  country?: string;
  city?: string;
  referrer?: string;
  referrerDomain?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  value?: number;
  duration?: number;
  metadata?: any;
}

export interface ArticleMetrics {
  articleId: string;
  title: string;
  slug: string;
  publishedAt?: Date;
  views: number;
  uniqueViews: number;
  likes: number;
  shares: number;
  comments: number;
  avgTimeOnPage: number;
  bounceRate: number;
  clickThroughRate: number;
  engagementRate: number;
  performanceScore: number;
  seoScore: number;
  socialShares: {
    facebook: number;
    twitter: number;
    linkedin: number;
    whatsapp: number;
  };
  trafficSources: {
    organic: number;
    social: number;
    direct: number;
    referral: number;
  };
  deviceBreakdown: {
    mobile: number;
    desktop: number;
    tablet: number;
  };
}

export interface DashboardMetrics {
  overview: {
    totalViews: number;
    totalUniqueViews: number;
    totalArticles: number;
    avgEngagementRate: number;
    topPerformingArticle: string;
    growthRate: number; // percentage
  };
  realTime: {
    activeUsers: number;
    pageViewsLast24h: number;
    topArticlesNow: ArticleMetrics[];
    currentTrafficSources: Record<string, number>;
  };
  trends: {
    viewsTrend: { date: string; views: number }[];
    engagementTrend: { date: string; engagement: number }[];
    popularCategories: { categoryId: string; name: string; views: number }[];
    topAuthors: { authorId: string; name: string; avgPerformance: number }[];
  };
  performance: {
    avgPageLoadTime: number;
    avgTimeOnSite: number;
    bounceRate: number;
    mobileTrafficPercentage: number;
    conversionRate: number;
  };
}

export interface UserBehaviorInsights {
  visitorId: string;
  isReturning: boolean;
  sessionCount: number;
  totalTimeOnSite: number;
  articlesRead: number;
  preferredCategories: string[];
  readingTimePreference: string;
  devicePreference: string;
  engagementLevel: 'low' | 'medium' | 'high';
  lastVisit: Date;
  averageSessionDuration: number;
}

export interface ContentPerformanceInsights {
  articleId: string;
  performanceScore: number;
  engagementRate: number;
  shareVelocity: number;
  readabilityScore: number;
  seoScore: number;
  competitivePosition: 'above_average' | 'average' | 'below_average';
  improvementSuggestions: string[];
  peakTrafficHour: number;
  bestPerformingDevice: string;
  topTrafficSource: string;
}

export class AnalyticsService {
  private db: DatabaseType;

  constructor(db: DatabaseType) {
    this.db = db;
  }

  /**
   * Registrar evento de analytics
   */
  async trackEvent(eventData: AnalyticsEventData): Promise<void> {
    try {
      await this.db.insert(analyticsEvents).values({
        id: generateId(),
        ...eventData,
        metadata: eventData.metadata ? JSON.stringify(eventData.metadata) : null,
        createdAt: new Date(),
      });

      // Atualizar métricas agregadas se for um evento de artigo
      if (eventData.articleId && eventData.eventType === 'page_view') {
        await this.updateArticleMetrics(eventData.articleId, eventData);
      }

      console.log(`📊 Analytics event tracked: ${eventData.eventType}/${eventData.eventAction}`);
    } catch (error) {
      console.error('Error tracking analytics event:', error);
      // Não falhar a operação principal
    }
  }

  /**
   * Obter métricas de um artigo
   */
  async getArticleMetrics(articleId: string, dateRange?: { start: Date; end: Date }): Promise<ArticleMetrics | null> {
    try {
      // Buscar dados do artigo
      const [article] = await this.db
        .select({
          id: articles.id,
          title: articles.title,
          slug: articles.slug,
          publishedAt: articles.publishedAt,
        })
        .from(articles)
        .where(eq(articles.id, articleId))
        .limit(1);

      if (!article) return null;

      // Buscar métricas agregadas
      const [metrics] = await this.db
        .select()
        .from(articleAnalytics)
        .where(eq(articleAnalytics.articleId, articleId))
        .limit(1);

      // Buscar performance calculada
      const [performance] = await this.db
        .select()
        .from(contentPerformanceAnalytics)
        .where(eq(contentPerformanceAnalytics.articleId, articleId))
        .orderBy(desc(contentPerformanceAnalytics.calculatedAt))
        .limit(1);

      // Calcular métricas adicionais baseadas em eventos
      let additionalMetrics = {};
      if (dateRange) {
        const eventMetrics = await this.db
          .select({
            eventType: analyticsEvents.eventType,
            eventAction: analyticsEvents.eventAction,
            count: count(),
            avgDuration: avg(analyticsEvents.duration),
          })
          .from(analyticsEvents)
          .where(
            and(
              eq(analyticsEvents.articleId, articleId),
              gte(analyticsEvents.createdAt, dateRange.start),
              lte(analyticsEvents.createdAt, dateRange.end)
            )
          )
          .groupBy(analyticsEvents.eventType, analyticsEvents.eventAction);

        additionalMetrics = this.processEventMetrics(eventMetrics);
      }

      return {
        articleId,
        title: article.title,
        slug: article.slug,
        publishedAt: article.publishedAt,
        views: metrics?.views || 0,
        uniqueViews: metrics?.uniqueViews || 0,
        likes: metrics?.likes || 0,
        shares: metrics?.shares || 0,
        comments: metrics?.comments || 0,
        avgTimeOnPage: metrics?.avgTimeOnPage || 0,
        bounceRate: (metrics?.bounceRate || 0) / 100,
        clickThroughRate: (metrics?.clickThroughRate || 0) / 100,
        engagementRate: (performance?.engagementRate || 0) / 100,
        performanceScore: performance?.performanceScore || 0,
        seoScore: performance?.seoScore || 0,
        socialShares: {
          facebook: metrics?.facebookShares || 0,
          twitter: metrics?.twitterShares || 0,
          linkedin: metrics?.linkedinShares || 0,
          whatsapp: metrics?.whatsappShares || 0,
        },
        trafficSources: {
          organic: metrics?.organicTraffic || 0,
          social: metrics?.socialTraffic || 0,
          direct: metrics?.directTraffic || 0,
          referral: metrics?.referralTraffic || 0,
        },
        deviceBreakdown: {
          mobile: metrics?.mobileViews || 0,
          desktop: metrics?.desktopViews || 0,
          tablet: metrics?.tabletViews || 0,
        },
        ...additionalMetrics,
      };

    } catch (error) {
      console.error('Error getting article metrics:', error);
      return null;
    }
  }

  /**
   * Obter métricas do dashboard
   */
  async getDashboardMetrics(dateRange?: { start: Date; end: Date }): Promise<DashboardMetrics> {
    try {
      const now = new Date();
      const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const start = dateRange?.start || defaultStart;
      const end = dateRange?.end || now;

      // Overview metrics
      const [overviewMetrics] = await this.db
        .select({
          totalViews: sum(articleAnalytics.views),
          totalUniqueViews: sum(articleAnalytics.uniqueViews),
          avgEngagementRate: avg(contentPerformanceAnalytics.engagementRate),
        })
        .from(articleAnalytics)
        .leftJoin(contentPerformanceAnalytics, eq(articleAnalytics.articleId, contentPerformanceAnalytics.articleId))
        .where(
          and(
            gte(articleAnalytics.date, start),
            lte(articleAnalytics.date, end)
          )
        );

      // Total articles in period
      const [articleCount] = await this.db
        .select({ count: count() })
        .from(articles)
        .where(
          and(
            gte(articles.publishedAt, start),
            lte(articles.publishedAt, end)
          )
        );

      // Top performing article
      const [topArticle] = await this.db
        .select({
          title: articles.title,
          views: articleAnalytics.views,
        })
        .from(articleAnalytics)
        .innerJoin(articles, eq(articleAnalytics.articleId, articles.id))
        .where(
          and(
            gte(articleAnalytics.date, start),
            lte(articleAnalytics.date, end)
          )
        )
        .orderBy(desc(articleAnalytics.views))
        .limit(1);

      // Real-time metrics (last 24 hours)
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const [realtimeMetrics] = await this.db
        .select({
          activeUsers: sql<number>`COUNT(DISTINCT ${analyticsEvents.sessionId})`,
          pageViews: count(),
        })
        .from(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.eventType, 'page_view'),
            gte(analyticsEvents.createdAt, last24h)
          )
        );

      // Top articles now (last 24h)
      const topArticlesNow = await this.getTopArticles(5, { start: last24h, end: now });

      // Traffic sources (last 24h)
      const trafficSources = await this.db
        .select({
          utmSource: analyticsEvents.utmSource,
          referrerDomain: analyticsEvents.referrerDomain,
          count: count(),
        })
        .from(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.eventType, 'page_view'),
            gte(analyticsEvents.createdAt, last24h)
          )
        )
        .groupBy(analyticsEvents.utmSource, analyticsEvents.referrerDomain);

      // Trends (daily data for last 7 days)
      const trends = await this.getAnalyticsTrends(7);

      // Performance metrics
      const [performanceMetrics] = await this.db
        .select({
          avgPageLoadTime: avg(articleAnalytics.loadTime),
          bounceRate: avg(articleAnalytics.bounceRate),
          mobileViews: sum(articleAnalytics.mobileViews),
          totalViews: sum(articleAnalytics.views),
        })
        .from(articleAnalytics)
        .where(
          and(
            gte(articleAnalytics.date, start),
            lte(articleAnalytics.date, end)
          )
        );

      const totalViews = Number(performanceMetrics?.totalViews) || 1;
      const mobilePercentage = ((Number(performanceMetrics?.mobileViews) || 0) / totalViews) * 100;

      return {
        overview: {
          totalViews: Number(overviewMetrics?.totalViews) || 0,
          totalUniqueViews: Number(overviewMetrics?.totalUniqueViews) || 0,
          totalArticles: Number(articleCount?.count) || 0,
          avgEngagementRate: (Number(overviewMetrics?.avgEngagementRate) || 0) / 100,
          topPerformingArticle: topArticle?.title || 'N/A',
          growthRate: 0, // TODO: Calculate based on previous period
        },
        realTime: {
          activeUsers: Number(realtimeMetrics?.activeUsers) || 0,
          pageViewsLast24h: Number(realtimeMetrics?.pageViews) || 0,
          topArticlesNow: topArticlesNow.slice(0, 3),
          currentTrafficSources: this.processTrafficSources(trafficSources),
        },
        trends,
        performance: {
          avgPageLoadTime: Number(performanceMetrics?.avgPageLoadTime) || 0,
          avgTimeOnSite: 0, // TODO: Calculate from user behavior
          bounceRate: (Number(performanceMetrics?.bounceRate) || 0) / 100,
          mobileTrafficPercentage: mobilePercentage,
          conversionRate: 0, // TODO: Define and calculate conversions
        },
      };

    } catch (error) {
      console.error('Error getting dashboard metrics:', error);
      return this.getEmptyDashboardMetrics();
    }
  }

  /**
   * Obter top artigos por período
   */
  async getTopArticles(limit: number = 10, dateRange?: { start: Date; end: Date }): Promise<ArticleMetrics[]> {
    try {
      const conditions = dateRange 
        ? and(
            gte(articleAnalytics.date, dateRange.start),
            lte(articleAnalytics.date, dateRange.end)
          )
        : undefined;

      const results = await this.db
        .select({
          articleId: articleAnalytics.articleId,
          title: articles.title,
          slug: articles.slug,
          publishedAt: articles.publishedAt,
          views: articleAnalytics.views,
          uniqueViews: articleAnalytics.uniqueViews,
          likes: articleAnalytics.likes,
          shares: articleAnalytics.shares,
          avgTimeOnPage: articleAnalytics.avgTimeOnPage,
          bounceRate: articleAnalytics.bounceRate,
          engagementRate: contentPerformanceAnalytics.engagementRate,
          performanceScore: contentPerformanceAnalytics.performanceScore,
        })
        .from(articleAnalytics)
        .innerJoin(articles, eq(articleAnalytics.articleId, articles.id))
        .leftJoin(contentPerformanceAnalytics, eq(articleAnalytics.articleId, contentPerformanceAnalytics.articleId))
        .where(conditions)
        .orderBy(desc(articleAnalytics.views))
        .limit(limit);

      return results.map(row => ({
        articleId: row.articleId,
        title: row.title,
        slug: row.slug,
        publishedAt: row.publishedAt,
        views: row.views || 0,
        uniqueViews: row.uniqueViews || 0,
        likes: row.likes || 0,
        shares: row.shares || 0,
        comments: 0,
        avgTimeOnPage: row.avgTimeOnPage || 0,
        bounceRate: (row.bounceRate || 0) / 100,
        clickThroughRate: 0,
        engagementRate: (row.engagementRate || 0) / 100,
        performanceScore: row.performanceScore || 0,
        seoScore: 0,
        socialShares: { facebook: 0, twitter: 0, linkedin: 0, whatsapp: 0 },
        trafficSources: { organic: 0, social: 0, direct: 0, referral: 0 },
        deviceBreakdown: { mobile: 0, desktop: 0, tablet: 0 },
      }));

    } catch (error) {
      console.error('Error getting top articles:', error);
      return [];
    }
  }

  /**
   * Obter insights de comportamento do usuário
   */
  async getUserBehaviorInsights(visitorId: string): Promise<UserBehaviorInsights | null> {
    try {
      const [behavior] = await this.db
        .select()
        .from(userBehaviorAnalytics)
        .where(eq(userBehaviorAnalytics.visitorId, visitorId))
        .orderBy(desc(userBehaviorAnalytics.lastActivity))
        .limit(1);

      if (!behavior) return null;

      // Calcular nível de engajamento
      let engagementLevel: 'low' | 'medium' | 'high' = 'low';
      const engagementScore = behavior.articlesRead + (behavior.likesGiven * 2) + (behavior.sharesPerformed * 3);
      
      if (engagementScore >= 10) engagementLevel = 'high';
      else if (engagementScore >= 5) engagementLevel = 'medium';

      return {
        visitorId: behavior.visitorId,
        isReturning: behavior.returnVisitor,
        sessionCount: behavior.pagesVisited, // Approximate
        totalTimeOnSite: behavior.sessionDuration,
        articlesRead: behavior.articlesRead,
        preferredCategories: behavior.preferredCategories ? JSON.parse(behavior.preferredCategories as string) : [],
        readingTimePreference: behavior.readingTimePreference || 'unknown',
        devicePreference: behavior.devicePreference || 'unknown',
        engagementLevel,
        lastVisit: behavior.lastActivity,
        averageSessionDuration: behavior.avgReadingTime,
      };

    } catch (error) {
      console.error('Error getting user behavior insights:', error);
      return null;
    }
  }

  /**
   * Obter insights de performance de conteúdo
   */
  async getContentPerformanceInsights(articleId: string): Promise<ContentPerformanceInsights | null> {
    try {
      const [performance] = await this.db
        .select()
        .from(contentPerformanceAnalytics)
        .where(eq(contentPerformanceAnalytics.articleId, articleId))
        .orderBy(desc(contentPerformanceAnalytics.calculatedAt))
        .limit(1);

      if (!performance) return null;

      // Determinar posição competitiva
      let competitivePosition: 'above_average' | 'average' | 'below_average' = 'average';
      if (performance.performanceScore > (performance.siteAvgPerformance || 50)) {
        competitivePosition = 'above_average';
      } else if (performance.performanceScore < (performance.siteAvgPerformance || 50) * 0.8) {
        competitivePosition = 'below_average';
      }

      // Gerar sugestões de melhoria
      const suggestions = this.generateImprovementSuggestions(performance);

      return {
        articleId,
        performanceScore: performance.performanceScore,
        engagementRate: performance.engagementRate / 100,
        shareVelocity: performance.shareVelocity,
        readabilityScore: performance.readabilityScore,
        seoScore: performance.seoScore,
        competitivePosition,
        improvementSuggestions: suggestions,
        peakTrafficHour: 14, // TODO: Calculate from analytics events
        bestPerformingDevice: 'mobile', // TODO: Calculate from device breakdown
        topTrafficSource: 'organic', // TODO: Calculate from traffic sources
      };

    } catch (error) {
      console.error('Error getting content performance insights:', error);
      return null;
    }
  }

  /**
   * Calcular score de performance de um artigo
   */
  async calculatePerformanceScore(articleId: string): Promise<number> {
    try {
      const metrics = await this.getArticleMetrics(articleId);
      if (!metrics) return 0;

      // Weighted scoring algorithm
      const viewsScore = Math.min((metrics.views / 1000) * 20, 25); // Max 25 points
      const engagementScore = metrics.engagementRate * 25; // Max 25 points
      const socialScore = Math.min((metrics.shares / 50) * 15, 15); // Max 15 points
      const timeScore = Math.min((metrics.avgTimeOnPage / 180) * 15, 15); // Max 15 points (3 min)
      const bounceScore = (1 - metrics.bounceRate) * 20; // Max 20 points

      const totalScore = viewsScore + engagementScore + socialScore + timeScore + bounceScore;
      
      return Math.round(Math.min(totalScore, 100));

    } catch (error) {
      console.error('Error calculating performance score:', error);
      return 0;
    }
  }

  /**
   * Atualizar métricas de artigo
   */
  private async updateArticleMetrics(articleId: string, eventData: AnalyticsEventData): Promise<void> {
    try {
      // Verificar se já existe entrada para hoje
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [existing] = await this.db
        .select()
        .from(articleAnalytics)
        .where(
          and(
            eq(articleAnalytics.articleId, articleId),
            gte(articleAnalytics.date, today)
          )
        )
        .limit(1);

      const updateData = {
        views: (existing?.views || 0) + 1,
        lastUpdated: new Date(),
      };

      // Incrementar contadores baseados no tipo de dispositivo
      if (eventData.deviceType === 'mobile') {
        updateData['mobileViews'] = (existing?.mobileViews || 0) + 1;
      } else if (eventData.deviceType === 'desktop') {
        updateData['desktopViews'] = (existing?.desktopViews || 0) + 1;
      } else if (eventData.deviceType === 'tablet') {
        updateData['tabletViews'] = (existing?.tabletViews || 0) + 1;
      }

      // Incrementar contadores de fonte de tráfego
      if (eventData.utmSource || eventData.referrerDomain) {
        if (eventData.utmSource === 'google' || eventData.referrerDomain?.includes('google')) {
          updateData['organicTraffic'] = (existing?.organicTraffic || 0) + 1;
        } else if (eventData.utmMedium === 'social' || this.isSocialReferrer(eventData.referrerDomain)) {
          updateData['socialTraffic'] = (existing?.socialTraffic || 0) + 1;
        } else if (eventData.referrer) {
          updateData['referralTraffic'] = (existing?.referralTraffic || 0) + 1;
        } else {
          updateData['directTraffic'] = (existing?.directTraffic || 0) + 1;
        }
      }

      if (existing) {
        await this.db
          .update(articleAnalytics)
          .set(updateData)
          .where(eq(articleAnalytics.id, existing.id));
      } else {
        await this.db.insert(articleAnalytics).values({
          id: generateId(),
          articleId,
          date: today,
          ...updateData,
        });
      }

    } catch (error) {
      console.error('Error updating article metrics:', error);
    }
  }

  /**
   * Obter trends de analytics
   */
  private async getAnalyticsTrends(days: number = 7): Promise<any> {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      // Views trend
      const viewsTrend = await this.db
        .select({
          date: sql<string>`DATE(${articleAnalytics.date})`,
          views: sum(articleAnalytics.views),
        })
        .from(articleAnalytics)
        .where(
          and(
            gte(articleAnalytics.date, startDate),
            lte(articleAnalytics.date, endDate)
          )
        )
        .groupBy(sql`DATE(${articleAnalytics.date})`)
        .orderBy(sql`DATE(${articleAnalytics.date})`);

      // Popular categories
      const popularCategories = await this.db
        .select({
          categoryId: articles.categoryId,
          name: categories.name,
          views: sum(articleAnalytics.views),
        })
        .from(articleAnalytics)
        .innerJoin(articles, eq(articleAnalytics.articleId, articles.id))
        .leftJoin(categories, eq(articles.categoryId, categories.id))
        .where(
          and(
            gte(articleAnalytics.date, startDate),
            lte(articleAnalytics.date, endDate)
          )
        )
        .groupBy(articles.categoryId, categories.name)
        .orderBy(desc(sum(articleAnalytics.views)))
        .limit(5);

      return {
        viewsTrend: viewsTrend.map(row => ({
          date: row.date,
          views: Number(row.views) || 0,
        })),
        engagementTrend: [], // TODO: Calculate engagement trend
        popularCategories: popularCategories.map(row => ({
          categoryId: row.categoryId || 'unknown',
          name: row.name || 'Uncategorized',
          views: Number(row.views) || 0,
        })),
        topAuthors: [], // TODO: Calculate top authors
      };

    } catch (error) {
      console.error('Error getting analytics trends:', error);
      return {
        viewsTrend: [],
        engagementTrend: [],
        popularCategories: [],
        topAuthors: [],
      };
    }
  }

  /**
   * Processar métricas de eventos
   */
  private processEventMetrics(eventMetrics: any[]): any {
    const processed = {
      additionalViews: 0,
      additionalShares: 0,
      additionalLikes: 0,
    };

    eventMetrics.forEach(metric => {
      if (metric.eventType === 'page_view') {
        processed.additionalViews += Number(metric.count);
      } else if (metric.eventType === 'share') {
        processed.additionalShares += Number(metric.count);
      } else if (metric.eventType === 'like') {
        processed.additionalLikes += Number(metric.count);
      }
    });

    return processed;
  }

  /**
   * Processar fontes de tráfego
   */
  private processTrafficSources(sources: any[]): Record<string, number> {
    const processed: Record<string, number> = {
      organic: 0,
      social: 0,
      direct: 0,
      referral: 0,
    };

    sources.forEach(source => {
      const count = Number(source.count) || 0;
      
      if (source.utmSource === 'google' || source.referrerDomain?.includes('google')) {
        processed.organic += count;
      } else if (this.isSocialReferrer(source.referrerDomain)) {
        processed.social += count;
      } else if (source.referrerDomain) {
        processed.referral += count;
      } else {
        processed.direct += count;
      }
    });

    return processed;
  }

  /**
   * Verificar se referrer é de rede social
   */
  private isSocialReferrer(referrerDomain?: string): boolean {
    if (!referrerDomain) return false;
    
    const socialDomains = ['facebook.com', 'twitter.com', 'linkedin.com', 'instagram.com', 'youtube.com'];
    return socialDomains.some(domain => referrerDomain.includes(domain));
  }

  /**
   * Gerar sugestões de melhoria
   */
  private generateImprovementSuggestions(performance: any): string[] {
    const suggestions: string[] = [];

    if (performance.readabilityScore < 60) {
      suggestions.push('Melhorar a legibilidade do conteúdo com frases mais curtas e parágrafos menores');
    }

    if (performance.seoScore < 70) {
      suggestions.push('Otimizar SEO com melhor uso de palavras-chave e meta descriptions');
    }

    if (performance.engagementRate < 20) {
      suggestions.push('Aumentar engajamento com CTAs mais claros e conteúdo mais interativo');
    }

    if (performance.shareVelocity < 5) {
      suggestions.push('Incluir mais elementos compartilháveis como quotes e estatísticas');
    }

    return suggestions;
  }

  /**
   * Retornar métricas vazias do dashboard
   */
  private getEmptyDashboardMetrics(): DashboardMetrics {
    return {
      overview: {
        totalViews: 0,
        totalUniqueViews: 0,
        totalArticles: 0,
        avgEngagementRate: 0,
        topPerformingArticle: 'N/A',
        growthRate: 0,
      },
      realTime: {
        activeUsers: 0,
        pageViewsLast24h: 0,
        topArticlesNow: [],
        currentTrafficSources: {},
      },
      trends: {
        viewsTrend: [],
        engagementTrend: [],
        popularCategories: [],
        topAuthors: [],
      },
      performance: {
        avgPageLoadTime: 0,
        avgTimeOnSite: 0,
        bounceRate: 0,
        mobileTrafficPercentage: 0,
        conversionRate: 0,
      },
    };
  }
}