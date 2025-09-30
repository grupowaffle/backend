import { eq, and, or, desc, asc, count, sql, like, isNull, isNotNull, inArray, notInArray, ne } from 'drizzle-orm';
import { BaseRepository, DatabaseType, PaginationOptions, PaginatedResult } from './BaseRepository';
import { articles, categories, authors, media, tags, articleTags, Article, NewArticle } from '../config/db/schema';
import { generateId } from '../lib/cuid';

export interface ArticleFilters {
  status?: string | string[];
  categoryId?: string;
  authorId?: string;
  source?: 'manual' | 'beehiiv';
  newsletter?: string;
  isFeatured?: boolean;
  featuredPosition?: number;
  featuredCategory?: string;
  publishedAfter?: Date;
  publishedBefore?: Date;
  dateRange?: {
    start: Date;
    end: Date;
  };
  tags?: string[];
  excludeId?: string;
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
   * Sync tags from JSON field to article_tags table
   * This ensures tags are queryable and can be used in relations
   */
  private async syncArticleTags(articleId: string, tagNames: string[]): Promise<void> {
    try {
      console.log(`🏷️ Syncing tags for article ${articleId}:`, tagNames);

      // Remove existing tags for this article
      await this.db
        .delete(articleTags)
        .where(eq(articleTags.articleId, articleId));

      if (!tagNames || tagNames.length === 0) {
        console.log(`🏷️ No tags to sync for article ${articleId}`);
        return;
      }

      // For each tag name, find or create the tag, then link to article
      for (const tagName of tagNames) {
        if (!tagName || typeof tagName !== 'string') continue;

        // Try to find existing tag by name
        const existingTags = await this.db
          .select()
          .from(tags)
          .where(eq(tags.name, tagName))
          .limit(1);

        let tagId: string;

        if (existingTags.length > 0) {
          tagId = existingTags[0].id;
        } else {
          // Create new tag
          const slug = tagName
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');

          const [newTag] = await this.db
            .insert(tags)
            .values({
              id: generateId(),
              name: tagName,
              slug: slug,
            })
            .returning();

          tagId = newTag.id;
        }

        // Link tag to article
        await this.db
          .insert(articleTags)
          .values({
            articleId: articleId,
            tagId: tagId,
          })
          .onConflictDoNothing(); // Ignore if already exists
      }
    } catch (error) {
      console.error('Error syncing article tags:', error);
      // Don't throw - tags sync is not critical
    }
  }

  /**
   * Create a new article
   */
  async create(data: NewArticle): Promise<Article> {
    try {
      console.log('Creating article with data:', JSON.stringify(data, null, 2));

      // Start with only required fields
      const insertData: any = {
        id: data.id || generateId(),
        title: data.title,
        slug: data.slug,
        content: data.content,
        excerpt: data.excerpt,
        status: data.status || 'draft',
        source: data.source || 'manual',
      };

      // Add optional fields only if they exist
      if (data.publishedAt) insertData.publishedAt = data.publishedAt;
      if (data.scheduledFor) insertData.scheduledFor = data.scheduledFor;
      if (data.seoTitle) insertData.seoTitle = data.seoTitle;
      if (data.seoDescription) insertData.seoDescription = data.seoDescription;
      if (data.seoKeywords) insertData.seoKeywords = data.seoKeywords;
      if (data.categoryId) insertData.categoryId = data.categoryId;
      if (data.tags) insertData.tags = data.tags;
      if (data.sourceId) insertData.sourceId = data.sourceId;
      if (data.sourceUrl) insertData.sourceUrl = data.sourceUrl;
      if (data.newsletter) insertData.newsletter = data.newsletter;
      if (data.isFeatured !== undefined) insertData.isFeatured = data.isFeatured;
      if (data.featuredPosition) insertData.featuredPosition = data.featuredPosition;
      if (data.featuredUntil) insertData.featuredUntil = data.featuredUntil;
      if (data.featuredCategory) insertData.featuredCategory = data.featuredCategory;
      if (data.featuredBy) insertData.featuredBy = data.featuredBy;
      if (data.featuredImageId) insertData.featuredImageId = data.featuredImageId;
      if (data.featuredImage) insertData.featuredImage = data.featuredImage;
      if (data.galleryIds) insertData.galleryIds = data.galleryIds;
      if (data.authorId) insertData.authorId = data.authorId;
      if (data.editorId) insertData.editorId = data.editorId;

      // Set featuredAt if article is featured
      if (data.isFeatured) {
        insertData.featuredAt = new Date();
      }

      console.log('Insert data:', JSON.stringify(insertData, null, 2));

      const [article] = await this.db
        .insert(articles)
        .values(insertData)
        .returning();

      // Sync tags to article_tags table
      if (data.tags && Array.isArray(data.tags)) {
        await this.syncArticleTags(article.id, data.tags as string[]);
      }

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

      // Sync tags to article_tags table if tags are provided
      if (data.tags !== undefined) {
        console.log(`🏷️ Update - received tags:`, data.tags);
        const tagNames = Array.isArray(data.tags) ? data.tags as string[] : [];
        console.log(`🏷️ Update - parsed tag names:`, tagNames);
        await this.syncArticleTags(id, tagNames);
      }

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
   * Find article by BeehIV post ID
   */
  async findByBeehiivPostId(postId: string): Promise<Article | null> {
    try {
      const result = await this.db
        .select()
        .from(articles)
        .where(
          and(
            eq(articles.sourceId, postId),
            eq(articles.source, 'beehiiv'),
            // Ignore deleted and archived articles
            notInArray(articles.status, ['deleted', 'archived'])
          )
        )
        .limit(1);

      return result[0] || null;
    } catch (error) {
      this.handleError(error, 'find article by beehiiv post id');
      throw error;
    }
  }

  /**
   * Upsert article (create or update if exists)
   */
  async upsert(data: NewArticle): Promise<Article> {
    try {
      console.log(`🔄 Upserting article: ${data.title}`);

      // Check if article already exists by sourceId for beehiiv articles
      let existingArticle: Article | null = null;

      if (data.source === 'beehiiv' && data.sourceId) {
        existingArticle = await this.findByBeehiivPostId(data.sourceId);
      }

      // IMPORTANT: For BeehIV content, we ONLY match by sourceId
      // We do NOT check by slug to avoid false matches with manual articles
      // Each BeehIV post has a unique ID like "post_5990a261-c61f-4a98-841f-d514d71c8c9b"

      if (existingArticle) {
        // Check if article is already published or in advanced workflow states
        const protectedStatuses = ['published', 'scheduled', 'in_review', 'approved'];
        const isProtected = protectedStatuses.includes(existingArticle.status) ||
                           (existingArticle.status === 'published' && existingArticle.publishedAt);

        if (isProtected) {
          console.log(`🚫 Article in protected status (${existingArticle.status}), skipping update: ${existingArticle.id} - "${existingArticle.title}"`);
          return existingArticle;
        }

        console.log(`📝 Updating existing article: ${existingArticle.id} (status: ${existingArticle.status})`);

        // Update existing article only if not published
        const [updatedArticle] = await this.db
          .update(articles)
          .set({
            ...data,
            updatedAt: new Date(),
          })
          .where(eq(articles.id, existingArticle.id))
          .returning();

        return updatedArticle;
      } else {
        console.log(`✨ Creating new article: ${data.title}`);

        // Create new article
        return await this.create(data);
      }
    } catch (error) {
      console.error('❌ Error in upsert article:', error);
      this.handleError(error, 'upsert article');
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
   * Get complete article statistics
   */
  async getCompleteStats(): Promise<{
    total: number;
    published: number;
    draft: number;
    review: number;
    archived: number;
    beehiiv_pending: number;
    approved: number;
    scheduled: number;
    rejected: number;
    totalViews: number;
    totalLikes: number;
    totalShares: number;
    totalComments: number;
  }> {
    try {
      // Get status counts
      const statusCounts = await this.getCountByStatus();
      
      // Get totals for views, likes, shares
      const totalsResult = await this.db
        .select({
          totalViews: sql<number>`COALESCE(SUM(${articles.views}), 0)`,
          totalLikes: sql<number>`COALESCE(SUM(${articles.likes}), 0)`,
          totalShares: sql<number>`COALESCE(SUM(${articles.shares}), 0)`,
          totalCount: count(),
        })
        .from(articles);

      const totals = totalsResult[0] || {
        totalViews: 0,
        totalLikes: 0,
        totalShares: 0,
        totalCount: 0,
      };

      // Map status counts with defaults
      const published = statusCounts.published || 0;
      const draft = statusCounts.draft || 0;
      const review = statusCounts.review || 0;
      const archived = statusCounts.archived || 0;
      const beehiiv_pending = statusCounts.beehiiv_pending || 0;
      const approved = statusCounts.approved || 0;
      const scheduled = statusCounts.scheduled || 0;
      const rejected = statusCounts.rejected || 0;

      const total = Number(totals.totalCount);

      return {
        total,
        published,
        draft,
        review,
        archived,
        beehiiv_pending,
        approved,
        scheduled,
        rejected,
        totalViews: Number(totals.totalViews),
        totalLikes: Number(totals.totalLikes),
        totalShares: Number(totals.totalShares),
        totalComments: 0, // TODO: Implementar quando houver sistema de comentários
      };
    } catch (error) {
      this.handleError(error, 'get complete article stats');
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

    if (filters.featuredPosition !== undefined) {
      conditions.push(eq(articles.featuredPosition, filters.featuredPosition));
    }

    if (filters.featuredCategory) {
      conditions.push(eq(articles.featuredCategory, filters.featuredCategory));
    }

    if (filters.publishedAfter) {
      conditions.push(sql`${articles.publishedAt} >= ${filters.publishedAfter}`);
    }

    if (filters.publishedBefore) {
      conditions.push(sql`${articles.publishedAt} <= ${filters.publishedBefore}`);
    }

    if (filters.dateRange) {
      conditions.push(
        and(
          sql`${articles.publishedAt} >= ${filters.dateRange.start}`,
          sql`${articles.publishedAt} <= ${filters.dateRange.end}`
        )
      );
    }

    if (filters.tags && filters.tags.length > 0) {
      // Filter by tags using JSON contains
      const tagConditions = filters.tags.map(tag => 
        sql`${articles.tags}::text ILIKE ${'%' + tag + '%'}`
      );
      conditions.push(or(...tagConditions));
    }

    if (filters.excludeId) {
      conditions.push(sql`${articles.id} != ${filters.excludeId}`);
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