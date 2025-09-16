import { DrizzleClient } from '../config/db';
import { articles, articleAnalytics } from '../config/db/schema';
import { eq, desc, and, sql, count, gte, lte, between } from 'drizzle-orm';
import { BaseRepository } from './BaseRepository';

export interface ArticleAnalytics {
  id: string;
  articleId: string;
  views: number;
  uniqueViews: number;
  likes: number;
  shares: number;
  comments: number;
  avgTimeOnPage: number;
  bounceRate: number;
  clickThroughRate: number;
  conversionRate: number;
  facebookShares: number;
  twitterShares: number;
  linkedinShares: number;
  whatsappShares: number;
  organicTraffic: number;
  socialTraffic: number;
  directTraffic: number;
  referralTraffic: number;
  loadTime: number;
  mobileViews: number;
  desktopViews: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalyticsFilters {
  articleId?: string;
  source?: 'manual' | 'beehiiv';
  dateRange?: {
    start: Date;
    end: Date;
  };
  categoryId?: string;
}

export interface AnalyticsComparison {
  manual: {
    totalArticles: number;
    totalViews: number;
    totalLikes: number;
    totalShares: number;
    avgViewsPerArticle: number;
    avgLikesPerArticle: number;
    avgSharesPerArticle: number;
    avgTimeOnPage: number;
    bounceRate: number;
  };
  beehiiv: {
    totalArticles: number;
    totalViews: number;
    totalLikes: number;
    totalShares: number;
    avgViewsPerArticle: number;
    avgLikesPerArticle: number;
    avgSharesPerArticle: number;
    avgTimeOnPage: number;
    bounceRate: number;
  };
  comparison: {
    viewsDifference: number;
    likesDifference: number;
    sharesDifference: number;
    timeOnPageDifference: number;
    bounceRateDifference: number;
  };
}

export class AnalyticsRepository extends BaseRepository {
  constructor(db: DrizzleClient) {
    super(db);
  }

  async getArticleAnalytics(articleId: string): Promise<ArticleAnalytics | null> {
    const result = await this.db
      .select()
      .from(articleAnalytics)
      .where(eq(articleAnalytics.articleId, articleId))
      .limit(1);

    return result[0] || null;
  }

  async createOrUpdateAnalytics(articleId: string, data: Partial<ArticleAnalytics>): Promise<ArticleAnalytics> {
    const existing = await this.getArticleAnalytics(articleId);
    
    if (existing) {
      const result = await this.db
        .update(articleAnalytics)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(articleAnalytics.articleId, articleId))
        .returning();
      
      return result[0];
    } else {
      const result = await this.db
        .insert(articleAnalytics)
        .values({
          articleId,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      
      return result[0];
    }
  }

  async getTopArticles(limit: number = 10, filters?: AnalyticsFilters): Promise<any[]> {
    const conditions = this.buildWhereConditions(filters);
    
    return await this.db
      .select({
        article: articles,
        analytics: articleAnalytics,
      })
      .from(articles)
      .leftJoin(articleAnalytics, eq(articles.id, articleAnalytics.articleId))
      .where(conditions || undefined)
      .orderBy(desc(articleAnalytics.views))
      .limit(limit);
  }

  async getEngagementMetrics(filters?: AnalyticsFilters): Promise<any> {
    const conditions = this.buildWhereConditions(filters);
    
    const result = await this.db
      .select({
        totalViews: sql<number>`COALESCE(SUM(${articleAnalytics.views}), 0)`,
        totalLikes: sql<number>`COALESCE(SUM(${articleAnalytics.likes}), 0)`,
        totalShares: sql<number>`COALESCE(SUM(${articleAnalytics.shares}), 0)`,
        avgTimeOnPage: sql<number>`COALESCE(AVG(${articleAnalytics.avgTimeOnPage}), 0)`,
        avgBounceRate: sql<number>`COALESCE(AVG(${articleAnalytics.bounceRate}), 0)`,
        totalArticles: count(articles.id),
      })
      .from(articles)
      .leftJoin(articleAnalytics, eq(articles.id, articleAnalytics.articleId))
      .where(conditions || undefined);

    return result[0];
  }

  async getSourceComparison(): Promise<AnalyticsComparison> {
    // Manual articles metrics
    const manualResult = await this.db
      .select({
        totalArticles: count(articles.id),
        totalViews: sql<number>`COALESCE(SUM(${articleAnalytics.views}), 0)`,
        totalLikes: sql<number>`COALESCE(SUM(${articleAnalytics.likes}), 0)`,
        totalShares: sql<number>`COALESCE(SUM(${articleAnalytics.shares}), 0)`,
        avgTimeOnPage: sql<number>`COALESCE(AVG(${articleAnalytics.avgTimeOnPage}), 0)`,
        avgBounceRate: sql<number>`COALESCE(AVG(${articleAnalytics.bounceRate}), 0)`,
      })
      .from(articles)
      .leftJoin(articleAnalytics, eq(articles.id, articleAnalytics.articleId))
      .where(eq(articles.source, 'manual'));

    // BeehIV articles metrics
    const beehiivResult = await this.db
      .select({
        totalArticles: count(articles.id),
        totalViews: sql<number>`COALESCE(SUM(${articleAnalytics.views}), 0)`,
        totalLikes: sql<number>`COALESCE(SUM(${articleAnalytics.likes}), 0)`,
        totalShares: sql<number>`COALESCE(SUM(${articleAnalytics.shares}), 0)`,
        avgTimeOnPage: sql<number>`COALESCE(AVG(${articleAnalytics.avgTimeOnPage}), 0)`,
        avgBounceRate: sql<number>`COALESCE(AVG(${articleAnalytics.bounceRate}), 0)`,
      })
      .from(articles)
      .leftJoin(articleAnalytics, eq(articles.id, articleAnalytics.articleId))
      .where(eq(articles.source, 'beehiiv'));

    const manual = manualResult[0];
    const beehiiv = beehiivResult[0];

    // Calculate averages
    const manualAvgViews = manual.totalArticles > 0 ? manual.totalViews / manual.totalArticles : 0;
    const manualAvgLikes = manual.totalArticles > 0 ? manual.totalLikes / manual.totalArticles : 0;
    const manualAvgShares = manual.totalArticles > 0 ? manual.totalShares / manual.totalArticles : 0;

    const beehiivAvgViews = beehiiv.totalArticles > 0 ? beehiiv.totalViews / beehiiv.totalArticles : 0;
    const beehiivAvgLikes = beehiiv.totalArticles > 0 ? beehiiv.totalLikes / beehiiv.totalArticles : 0;
    const beehiivAvgShares = beehiiv.totalArticles > 0 ? beehiiv.totalShares / beehiiv.totalArticles : 0;

    // Calculate differences
    const viewsDifference = beehiivAvgViews - manualAvgViews;
    const likesDifference = beehiivAvgLikes - manualAvgLikes;
    const sharesDifference = beehiivAvgShares - manualAvgShares;
    const timeOnPageDifference = beehiiv.avgTimeOnPage - manual.avgTimeOnPage;
    const bounceRateDifference = beehiiv.avgBounceRate - manual.avgBounceRate;

    return {
      manual: {
        totalArticles: manual.totalArticles,
        totalViews: manual.totalViews,
        totalLikes: manual.totalLikes,
        totalShares: manual.totalShares,
        avgViewsPerArticle: manualAvgViews,
        avgLikesPerArticle: manualAvgLikes,
        avgSharesPerArticle: manualAvgShares,
        avgTimeOnPage: manual.avgTimeOnPage,
        bounceRate: manual.avgBounceRate,
      },
      beehiiv: {
        totalArticles: beehiiv.totalArticles,
        totalViews: beehiiv.totalViews,
        totalLikes: beehiiv.totalLikes,
        totalShares: beehiiv.totalShares,
        avgViewsPerArticle: beehiivAvgViews,
        avgLikesPerArticle: beehiivAvgLikes,
        avgSharesPerArticle: beehiivAvgShares,
        avgTimeOnPage: beehiiv.avgTimeOnPage,
        bounceRate: beehiiv.avgBounceRate,
      },
      comparison: {
        viewsDifference,
        likesDifference,
        sharesDifference,
        timeOnPageDifference,
        bounceRateDifference,
      },
    };
  }

  async getDailyMetrics(days: number = 30): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await this.db
      .select({
        date: sql<string>`DATE(${articleAnalytics.createdAt})`,
        totalViews: sql<number>`COALESCE(SUM(${articleAnalytics.views}), 0)`,
        totalLikes: sql<number>`COALESCE(SUM(${articleAnalytics.likes}), 0)`,
        totalShares: sql<number>`COALESCE(SUM(${articleAnalytics.shares}), 0)`,
        totalArticles: count(articles.id),
      })
      .from(articles)
      .leftJoin(articleAnalytics, eq(articles.id, articleAnalytics.articleId))
      .where(gte(articleAnalytics.createdAt, startDate))
      .groupBy(sql`DATE(${articleAnalytics.createdAt})`)
      .orderBy(sql`DATE(${articleAnalytics.createdAt})`);
  }

  async getCategoryPerformance(): Promise<any[]> {
    return await this.db
      .select({
        categoryId: articles.categoryId,
        totalArticles: count(articles.id),
        totalViews: sql<number>`COALESCE(SUM(${articleAnalytics.views}), 0)`,
        totalLikes: sql<number>`COALESCE(SUM(${articleAnalytics.likes}), 0)`,
        totalShares: sql<number>`COALESCE(SUM(${articleAnalytics.shares}), 0)`,
        avgViewsPerArticle: sql<number>`COALESCE(AVG(${articleAnalytics.views}), 0)`,
      })
      .from(articles)
      .leftJoin(articleAnalytics, eq(articles.id, articleAnalytics.articleId))
      .where(sql`${articles.categoryId} IS NOT NULL`)
      .groupBy(articles.categoryId)
      .orderBy(desc(sql`COALESCE(SUM(${articleAnalytics.views}), 0)`));
  }

  async getAuthorPerformance(): Promise<any[]> {
    return await this.db
      .select({
        authorId: articles.authorId,
        totalArticles: count(articles.id),
        totalViews: sql<number>`COALESCE(SUM(${articleAnalytics.views}), 0)`,
        totalLikes: sql<number>`COALESCE(SUM(${articleAnalytics.likes}), 0)`,
        totalShares: sql<number>`COALESCE(SUM(${articleAnalytics.shares}), 0)`,
        avgViewsPerArticle: sql<number>`COALESCE(AVG(${articleAnalytics.views}), 0)`,
      })
      .from(articles)
      .leftJoin(articleAnalytics, eq(articles.id, articleAnalytics.articleId))
      .where(sql`${articles.authorId} IS NOT NULL`)
      .groupBy(articles.authorId)
      .orderBy(desc(sql`COALESCE(SUM(${articleAnalytics.views}), 0)`));
  }

  private buildWhereConditions(filters?: AnalyticsFilters) {
    const conditions = [];

    if (filters?.articleId) {
      conditions.push(eq(articles.id, filters.articleId));
    }

    if (filters?.source) {
      conditions.push(eq(articles.source, filters.source));
    }

    if (filters?.categoryId) {
      conditions.push(eq(articles.categoryId, filters.categoryId));
    }

    if (filters?.dateRange) {
      conditions.push(
        between(
          articleAnalytics.createdAt,
          filters.dateRange.start,
          filters.dateRange.end
        )
      );
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }
}
