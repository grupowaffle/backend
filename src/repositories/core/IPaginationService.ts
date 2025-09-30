// Interfaces for pagination (Single Responsibility Principle + Interface Segregation)
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

export interface IPaginationService {
  applyPagination(query: any, options: PaginationOptions): any;
  applySorting(query: any, table: any, options: PaginationOptions): any;
  createPaginatedResult<T>(
    baseQuery: any,
    countQuery: any,
    options: PaginationOptions
  ): Promise<PaginatedResult<T>>;
}

export class PaginationService implements IPaginationService {
  applyPagination(query: any, options: PaginationOptions) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    return query.limit(limit).offset(offset);
  }

  applySorting(query: any, table: any, options: PaginationOptions) {
    if (!options.sortBy) return query;

    const column = table[options.sortBy];
    if (!column) return query;

    // Import from drizzle-orm
    const { desc, asc } = require('drizzle-orm');
    const sortFn = options.sortOrder === 'desc' ? desc : asc;
    return query.orderBy(sortFn(column));
  }

  async createPaginatedResult<T>(
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
}