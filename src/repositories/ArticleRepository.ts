import { eq, and, or, desc, asc, count, sql, like, isNull, isNotNull, inArray } from 'drizzle-orm';
import { BaseRepository, DatabaseType, PaginationOptions, PaginatedResult } from './BaseRepository';
import { articles, categories, authors, media, Article, NewArticle } from '../config/db/schema';

export interface ArticleFilters {
  status?: string | string[];
  categoryId?: string;
  authorId?: string;
  source?: 'manual' | 'beehiiv';
  newsletter?: string;
  isFeatured?: boolean;
  publishedAfter?: Date;
  publishedBefore?: Date;
  search?: string;
}

export interface ArticleListOptions extends PaginationOptions {
  filters?: ArticleFilters;
  includeRelations?: boolean;
}

export class ArticleRepository extends BaseRepository {
  constructor(db: DatabaseType) {
    super(db);
  }

  /**
   * Create a new article
   */
  async create(data: NewArticle): Promise<Article> {
    try {
      const [article] = await this.db
        .insert(articles)
        .values({
          ...data,
          updatedAt: new Date(),
        })
        .returning();

      return article;
    } catch (error) {
      this.handleError(error, 'create article');
      throw error;
    }
  }

  /**
   * Get article by ID
   */
  async findById(id: string, includeRelations = false): Promise<Article | null> {
    try {
      if (includeRelations) {
        const result = await this.db
          .select({
            article: articles,
            category: categories,
            author: authors,
            featuredMedia: media,
          })
          .from(articles)
          .leftJoin(categories, eq(articles.categoryId, categories.id))
          .leftJoin(authors, eq(articles.authorId, authors.id))
          .leftJoin(media, eq(articles.featuredImageId, media.id))
          .where(eq(articles.id, id))
          .limit(1);

        if (result.length === 0) return null;

        const { article, category, author, featuredMedia } = result[0];
        return {
          ...article,
          category,
          author,
          featuredMedia,
        } as any;
      }

      const result = await this.db
        .select()
        .from(articles)
        .where(eq(articles.id, id))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      this.handleError(error, 'find article by id');
      throw error;
    }
  }

  /**
   * Get article by slug
   */
  async findBySlug(slug: string, includeRelations = false): Promise<Article | null> {
    try {
      if (includeRelations) {
        const result = await this.db
          .select({
            article: articles,
            category: categories,
            author: authors,
            featuredMedia: media,
          })
          .from(articles)
          .leftJoin(categories, eq(articles.categoryId, categories.id))
          .leftJoin(authors, eq(articles.authorId, authors.id))
          .leftJoin(media, eq(articles.featuredImageId, media.id))
          .where(eq(articles.slug, slug))
          .limit(1);

        if (result.length === 0) return null;

        const { article, category, author, featuredMedia } = result[0];
        return {
          ...article,
          category,
          author,
          featuredMedia,
        } as any;
      }

      const result = await this.db
        .select()
        .from(articles)
        .where(eq(articles.slug, slug))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      this.handleError(error, 'find article by slug');
      throw error;
    }
  }

  /**
   * Update article
   */
  async update(id: string, data: Partial<NewArticle>): Promise<Article | null> {
    try {
      const [article] = await this.db
        .update(articles)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(articles.id, id))
        .returning();

      return article || null;
    } catch (error) {
      this.handleError(error, 'update article');
      throw error;
    }
  }

  /**
   * Delete article
   */
  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(articles)
        .where(eq(articles.id, id))
        .returning();

      return result.length > 0;
    } catch (error) {
      this.handleError(error, 'delete article');
      throw error;
    }
  }

  /**
   * List articles with filters and pagination
   */
  async list(options: ArticleListOptions = {}): Promise<PaginatedResult<Article>> {
    try {
      const { filters = {}, includeRelations = false, ...paginationOptions } = options;

      // Build WHERE conditions
      const conditions = this.buildWhereConditions(filters);

      // Base query
      let query;
      let countQuery;

      if (includeRelations) {
        query = this.db
          .select({
            article: articles,
            category: categories,
            author: authors,
            featuredMedia: media,
          })
          .from(articles)
          .leftJoin(categories, eq(articles.categoryId, categories.id))
          .leftJoin(authors, eq(articles.authorId, authors.id))
          .leftJoin(media, eq(articles.featuredImageId, media.id));
      } else {
        query = this.db.select().from(articles);
      }

      countQuery = this.db
        .select({ count: count() })
        .from(articles);

      // Apply WHERE conditions
      if (conditions) {
        query = query.where(conditions);
        countQuery = countQuery.where(conditions);
      }

      // Apply sorting
      query = this.applySorting(query, articles, {
        sortBy: paginationOptions.sortBy || 'createdAt',
        sortOrder: paginationOptions.sortOrder || 'desc',
      });

      // Apply pagination
      query = this.applyPagination(query, paginationOptions);

      return this.createPaginatedResult(query, countQuery, paginationOptions);
    } catch (error) {
      this.handleError(error, 'list articles');
      throw error;
    }
  }

  /**
   * Get published articles (for public API)
   */
  async listPublished(options: ArticleListOptions = {}): Promise<PaginatedResult<Article>> {
    return this.list({
      ...options,
      filters: {
        ...options.filters,
        status: 'published',
        publishedAfter: options.filters?.publishedAfter || new Date(0), // Only published articles
      },
    });
  }

  /**
   * Get featured articles
   */
  async listFeatured(featuredCategory?: string): Promise<Article[]> {
    try {
      let query = this.db
        .select()
        .from(articles)
        .where(
          and(
            eq(articles.isFeatured, true),
            eq(articles.status, 'published'),
            or(
              isNull(articles.featuredUntil),
              sql`${articles.featuredUntil} > NOW()`
            )
          )
        )
        .orderBy(asc(articles.featuredPosition), desc(articles.featuredAt));

      if (featuredCategory) {
        query = query.where(
          and(
            eq(articles.isFeatured, true),
            eq(articles.status, 'published'),
            eq(articles.featuredCategory, featuredCategory),
            or(
              isNull(articles.featuredUntil),
              sql`${articles.featuredUntil} > NOW()`
            )
          )
        );
      }

      return await query;
    } catch (error) {
      this.handleError(error, 'list featured articles');
      throw error;
    }
  }

  /**
   * Get articles by BeehIV post IDs
   */
  async findByBeehiivPostIds(postIds: string[]): Promise<Article[]> {
    try {
      if (postIds.length === 0) return [];

      return await this.db
        .select()
        .from(articles)
        .where(inArray(articles.sourceId, postIds));
    } catch (error) {
      this.handleError(error, 'find articles by beehiiv post ids');
      throw error;
    }
  }


  /**
   * Get articles count by status
   */
  async getCountByStatus(): Promise<Record<string, number>> {
    try {
      const result = await this.db
        .select({
          status: articles.status,
          count: count(),
        })
        .from(articles)
        .groupBy(articles.status);

      return result.reduce((acc, { status, count }) => {
        acc[status] = Number(count);
        return acc;
      }, {} as Record<string, number>);
    } catch (error) {
      this.handleError(error, 'get articles count by status');
      throw error;
    }
  }

  /**
   * Build WHERE conditions based on filters
   */
  private buildWhereConditions(filters: ArticleFilters) {
    const conditions = [];

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(inArray(articles.status, filters.status));
      } else {
        conditions.push(eq(articles.status, filters.status));
      }
    }

    if (filters.categoryId) {
      conditions.push(eq(articles.categoryId, filters.categoryId));
    }

    if (filters.authorId) {
      conditions.push(eq(articles.authorId, filters.authorId));
    }

    if (filters.source) {
      conditions.push(eq(articles.source, filters.source));
    }

    if (filters.newsletter) {
      conditions.push(eq(articles.newsletter, filters.newsletter));
    }

    if (filters.isFeatured !== undefined) {
      conditions.push(eq(articles.isFeatured, filters.isFeatured));
    }

    if (filters.publishedAfter) {
      conditions.push(sql`${articles.publishedAt} >= ${filters.publishedAfter}`);
    }

    if (filters.publishedBefore) {
      conditions.push(sql`${articles.publishedAt} <= ${filters.publishedBefore}`);
    }

    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        or(
          like(articles.title, searchTerm),
          like(articles.excerpt, searchTerm)
        )
      );
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * Increment view count
   */
  async incrementViews(id: string): Promise<void> {
    try {
      await this.db
        .update(articles)
        .set({
          views: sql`COALESCE(views, 0) + 1`,
          updatedAt: new Date(),
        })
        .where(eq(articles.id, id));
    } catch (error) {
      this.handleError(error, 'increment views');
      throw error;
    }
  }

  /**
   * Increment likes count
   */
  async incrementLikes(id: string): Promise<void> {
    try {
      await this.db
        .update(articles)
        .set({
          likes: sql`COALESCE(likes, 0) + 1`,
          updatedAt: new Date(),
        })
        .where(eq(articles.id, id));
    } catch (error) {
      this.handleError(error, 'increment likes');
      throw error;
    }
  }

  /**
   * Increment shares count
   */
  async incrementShares(id: string): Promise<void> {
    try {
      await this.db
        .update(articles)
        .set({
          shares: sql`COALESCE(shares, 0) + 1`,
          updatedAt: new Date(),
        })
        .where(eq(articles.id, id));
    } catch (error) {
      this.handleError(error, 'increment shares');
      throw error;
    }
  }

  /**
   * Count articles with filters
   */
  async count(filters: Record<string, any> = {}): Promise<number> {
    try {
      let query = this.db
        .select({ count: count() })
        .from(articles);

      // Apply filters
      const conditions = this.buildWhereConditions(filters as ArticleFilters);
      if (conditions) {
        query = query.where(conditions);
      }

      const result = await query;
      return result[0]?.count || 0;
    } catch (error) {
      this.handleError(error, 'count articles');
      throw error;
    }
  }
}