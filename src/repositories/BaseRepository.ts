import { DrizzleD1Database } from 'drizzle-orm/d1';
import { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { eq, and, or, desc, asc, count, sql } from 'drizzle-orm';
import * as schema from '../config/db/schema';

export type DatabaseType = DrizzleD1Database<typeof schema> | NeonDatabase<typeof schema>;

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class BaseRepository {
  protected db: DatabaseType;

  constructor(db: DatabaseType) {
    this.db = db;
  }

  /**
   * Apply pagination to a query
   */
  protected applyPagination(query: any, options: PaginationOptions) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    return query.limit(limit).offset(offset);
  }

  /**
   * Apply sorting to a query
   */
  protected applySorting(query: any, table: any, options: PaginationOptions) {
    if (!options.sortBy) return query;

    const column = table[options.sortBy];
    if (!column) return query;

    const sortFn = options.sortOrder === 'desc' ? desc : asc;
    return query.orderBy(sortFn(column));
  }

  /**
   * Create paginated result
   */
  protected async createPaginatedResult<T>(
    baseQuery: any,
    countQuery: any,
    options: PaginationOptions
  ): Promise<PaginatedResult<T>> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));

    // Get total count
    const [countResult] = await countQuery;
    const total = Number(countResult.count);

    // Get data
    const data = await baseQuery;

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Handle database errors
   */
  protected handleError(error: any, operation: string) {
    console.error(`Database error during ${operation}:`, error);
    
    if (error.code === '23505') {
      throw new Error('Record already exists');
    }
    if (error.code === '23503') {
      throw new Error('Referenced record does not exist');
    }
    if (error.code === '23514') {
      throw new Error('Check constraint violation');
    }
    
    throw new Error(`Database operation failed: ${operation}`);
  }
}