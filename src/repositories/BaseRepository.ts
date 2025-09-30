import { DrizzleD1Database } from 'drizzle-orm/d1';
import { NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from '../config/db/schema';
import { IErrorHandler, DatabaseErrorHandler } from './core/IErrorHandler';
import {
  IPaginationService,
  PaginationService,
  PaginationOptions,
  PaginatedResult
} from './core/IPaginationService';

export type DatabaseType = DrizzleD1Database<typeof schema> | NeonDatabase<typeof schema>;

// Export interfaces for use in other files
export { PaginationOptions, PaginatedResult };

/**
 * Base repository following SOLID principles:
 * - Single Responsibility: Only manages database connection
 * - Dependency Inversion: Depends on abstractions (interfaces)
 * - Open/Closed: Open for extension through composition
 */
export class BaseRepository {
  protected db: DatabaseType;
  protected errorHandler: IErrorHandler;
  protected paginationService: IPaginationService;

  constructor(
    db: DatabaseType,
    errorHandler?: IErrorHandler,
    paginationService?: IPaginationService
  ) {
    this.db = db;
    this.errorHandler = errorHandler || new DatabaseErrorHandler();
    this.paginationService = paginationService || new PaginationService();
  }

  /**
   * Apply pagination to a query (delegates to PaginationService)
   */
  protected applyPagination(query: any, options: PaginationOptions) {
    return this.paginationService.applyPagination(query, options);
  }

  /**
   * Apply sorting to a query (delegates to PaginationService)
   */
  protected applySorting(query: any, table: any, options: PaginationOptions) {
    return this.paginationService.applySorting(query, table, options);
  }

  /**
   * Create paginated result (delegates to PaginationService)
   */
  protected async createPaginatedResult<T>(
    baseQuery: any,
    countQuery: any,
    options: PaginationOptions
  ): Promise<PaginatedResult<T>> {
    return this.paginationService.createPaginatedResult<T>(baseQuery, countQuery, options);
  }

  /**
   * Handle database errors (delegates to ErrorHandler)
   */
  protected handleError(error: any, operation: string): never {
    return this.errorHandler.handle(error, operation);
  }
}