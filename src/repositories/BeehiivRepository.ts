import { eq, and, desc, count, inArray } from 'drizzle-orm';
import { BaseRepository, DatabaseType, PaginationOptions, PaginatedResult } from './BaseRepository';
import { 
  beehiivPublications, 
  beehiivPosts, 
  beehiivSyncLogs,
  BeehiivPublication, 
  NewBeehiivPublication,
  BeehiivPost,
  NewBeehiivPost,
  BeehiivSyncLog,
  NewBeehiivSyncLog
} from '../config/db/schema';

export class BeehiivRepository extends BaseRepository {
  constructor(db: DatabaseType) {
    super(db);
  }

  // ===============================
  // PUBLICATIONS
  // ===============================

  /**
   * Create a new publication
   */
  async createPublication(data: NewBeehiivPublication): Promise<BeehiivPublication> {
    try {
      const [publication] = await this.db
        .insert(beehiivPublications)
        .values(data)
        .returning();

      return publication;
    } catch (error) {
      this.handleError(error, 'create beehiiv publication');
      throw error;
    }
  }

  /**
   * Get publication by internal ID
   */
  async findPublicationById(id: string): Promise<BeehiivPublication | null> {
    try {
      const result = await this.db
        .select()
        .from(beehiivPublications)
        .where(eq(beehiivPublications.id, id))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      this.handleError(error, 'find publication by id');
      throw error;
    }
  }

  /**
   * Get publication by BeehIV ID
   */
  async findPublicationByBeehiivId(beehiivId: string): Promise<BeehiivPublication | null> {
    try {
      const result = await this.db
        .select()
        .from(beehiivPublications)
        .where(eq(beehiivPublications.beehiivId, beehiivId))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      this.handleError(error, 'find publication by beehiiv id');
      throw error;
    }
  }

  /**
   * Get all publications
   */
  async getAllPublications(): Promise<BeehiivPublication[]> {
    try {
      const result = await this.db
        .select()
        .from(beehiivPublications)
        .orderBy(beehiivPublications.name);

      return result;
    } catch (error) {
      this.handleError(error, 'get all publications');
      throw error;
    }
  }

  /**
   * List active publications
   */
  async listActivePublications(): Promise<BeehiivPublication[]> {
    try {
      console.log('🔍 Starting listActivePublications query...');

      const result = await this.db
        .select()
        .from(beehiivPublications)
        .where(eq(beehiivPublications.isActive, true))
        .orderBy(beehiivPublications.name);

      console.log('📊 Found active publications:', result.length);
      if (result.length > 0) {
        console.log('First publication:', result[0]);
      }

      return result;
    } catch (error) {
      console.error('❌ Error in listActivePublications:', error);
      this.handleError(error, 'list active publications');
      throw error;
    }
  }

  /**
   * Update publication last sync
   */
  async updatePublicationLastSync(id: string, lastSync: Date): Promise<void> {
    try {
      await this.db
        .update(beehiivPublications)
        .set({ lastSync })
        .where(eq(beehiivPublications.id, id));
    } catch (error) {
      this.handleError(error, 'update publication last sync');
      throw error;
    }
  }

  // ===============================
  // POSTS
  // ===============================

  /**
   * Create a new post
   */
  async createPost(data: NewBeehiivPost): Promise<BeehiivPost> {
    try {
      console.log('📝 Creating BeehIV post with data:', JSON.stringify(data, null, 2));
      
      const [post] = await this.db
        .insert(beehiivPosts)
        .values(data)
        .returning();

      console.log('✅ BeehIV post created successfully:', post.id);
      return post;
    } catch (error) {
      console.error('❌ Error creating BeehIV post:', error);
      this.handleError(error, 'create beehiiv post');
      throw error;
    }
  }

  /**
   * Get post by BeehIV ID
   */
  async findPostByBeehiivId(beehiivId: string): Promise<BeehiivPost | null> {
    try {
      const result = await this.db
        .select()
        .from(beehiivPosts)
        .where(eq(beehiivPosts.beehiivId, beehiivId))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      this.handleError(error, 'find post by beehiiv id');
      throw error;
    }
  }

  /**
   * List unprocessed posts
   */
  async listUnprocessedPosts(publicationId?: string): Promise<BeehiivPost[]> {
    try {
      let query = this.db
        .select()
        .from(beehiivPosts)
        .where(eq(beehiivPosts.processedAt, null))
        .orderBy(desc(beehiivPosts.createdTimestamp));

      if (publicationId) {
        query = query.where(
          and(
            eq(beehiivPosts.processedAt, null),
            eq(beehiivPosts.publicationId, publicationId)
          )
        );
      }

      return await query;
    } catch (error) {
      this.handleError(error, 'list unprocessed posts');
      throw error;
    }
  }

  /**
   * Mark post as processed
   */
  async markPostAsProcessed(id: string, articleId: string): Promise<void> {
    try {
      await this.db
        .update(beehiivPosts)
        .set({
          processedAt: new Date(),
          articleId,
        })
        .where(eq(beehiivPosts.id, id));
    } catch (error) {
      this.handleError(error, 'mark post as processed');
      throw error;
    }
  }

  /**
   * Get all posts with pagination
   */
  async listAllPosts(options: PaginationOptions = {}): Promise<PaginatedResult<BeehiivPost>> {
    try {
      // Base query
      const query = this.db
        .select()
        .from(beehiivPosts);

      const countQuery = this.db
        .select({ count: count() })
        .from(beehiivPosts);

      // Apply sorting
      const sortedQuery = this.applySorting(query, beehiivPosts, {
        sortBy: options.sortBy || 'createdTimestamp',
        sortOrder: options.sortOrder || 'desc',
      });

      // Apply pagination
      const paginatedQuery = this.applyPagination(sortedQuery, options);

      return this.createPaginatedResult(paginatedQuery, countQuery, options);
    } catch (error) {
      this.handleError(error, 'list all posts');
      throw error;
    }
  }

  /**
   * Get posts by publication
   */
  async listPostsByPublication(
    publicationId: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<BeehiivPost>> {
    try {
      // Base query
      const query = this.db
        .select()
        .from(beehiivPosts)
        .where(eq(beehiivPosts.publicationId, publicationId));

      const countQuery = this.db
        .select({ count: count() })
        .from(beehiivPosts)
        .where(eq(beehiivPosts.publicationId, publicationId));

      // Apply sorting
      const sortedQuery = this.applySorting(query, beehiivPosts, {
        sortBy: options.sortBy || 'createdTimestamp',
        sortOrder: options.sortOrder || 'desc',
      });

      // Apply pagination
      const paginatedQuery = this.applyPagination(sortedQuery, options);

      return this.createPaginatedResult(paginatedQuery, countQuery, options);
    } catch (error) {
      this.handleError(error, 'list posts by publication');
      throw error;
    }
  }

  /**
   * Check if posts exist by BeehIV IDs
   */
  async findExistingPostsByBeehiivIds(beehiivIds: string[]): Promise<BeehiivPost[]> {
    try {
      if (beehiivIds.length === 0) return [];

      return await this.db
        .select()
        .from(beehiivPosts)
        .where(inArray(beehiivPosts.beehiivId, beehiivIds));
    } catch (error) {
      this.handleError(error, 'find existing posts by beehiiv ids');
      throw error;
    }
  }

  // ===============================
  // SYNC LOGS
  // ===============================

  /**
   * Create sync log
   */
  async createSyncLog(data: NewBeehiivSyncLog): Promise<BeehiivSyncLog> {
    try {
      const [log] = await this.db
        .insert(beehiivSyncLogs)
        .values(data)
        .returning();

      return log;
    } catch (error) {
      this.handleError(error, 'create sync log');
      throw error;
    }
  }

  /**
   * Update sync log
   */
  async updateSyncLog(id: string, data: Partial<NewBeehiivSyncLog>): Promise<BeehiivSyncLog | null> {
    try {
      const [log] = await this.db
        .update(beehiivSyncLogs)
        .set(data)
        .where(eq(beehiivSyncLogs.id, id))
        .returning();

      return log || null;
    } catch (error) {
      this.handleError(error, 'update sync log');
      throw error;
    }
  }

  /**
   * Complete sync log
   */
  async completeSyncLog(
    id: string, 
    status: 'success' | 'partial' | 'failed', 
    stats: { processed: number; failed: number; errorDetails?: any }
  ): Promise<void> {
    try {
      await this.db
        .update(beehiivSyncLogs)
        .set({
          syncCompletedAt: new Date(),
          status,
          postsProcessed: stats.processed,
          postsFailed: stats.failed,
          errorDetails: stats.errorDetails,
        })
        .where(eq(beehiivSyncLogs.id, id));
    } catch (error) {
      this.handleError(error, 'complete sync log');
      throw error;
    }
  }

  /**
   * Get recent sync logs
   */
  async getRecentSyncLogs(limit = 10): Promise<BeehiivSyncLog[]> {
    try {
      return await this.db
        .select()
        .from(beehiivSyncLogs)
        .orderBy(desc(beehiivSyncLogs.syncStartedAt))
        .limit(limit);
    } catch (error) {
      this.handleError(error, 'get recent sync logs');
      throw error;
    }
  }

  /**
   * Get sync stats
   */
  async getSyncStats(publicationId?: string): Promise<{
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    totalPostsProcessed: number;
  }> {
    try {
      let query = this.db
        .select({
          status: beehiivSyncLogs.status,
          postsProcessed: beehiivSyncLogs.postsProcessed,
        })
        .from(beehiivSyncLogs);

      if (publicationId) {
        query = query.where(eq(beehiivSyncLogs.publicationId, publicationId));
      }

      const logs = await query;

      const stats = logs.reduce((acc, log) => {
        acc.totalSyncs++;
        if (log.status === 'success') acc.successfulSyncs++;
        if (log.status === 'failed') acc.failedSyncs++;
        acc.totalPostsProcessed += log.postsProcessed || 0;
        return acc;
      }, {
        totalSyncs: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
        totalPostsProcessed: 0,
      });

      return stats;
    } catch (error) {
      this.handleError(error, 'get sync stats');
      throw error;
    }
  }
}