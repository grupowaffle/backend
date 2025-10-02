import { DatabaseType } from './BaseRepository';
import { authors, users, articles } from '../config/db/schema';
import { eq, desc, and, like, sql, count } from 'drizzle-orm';

export interface Author {
  id: string;
  name: string;
  slug: string;
  bio?: string;
  avatar?: string;
  email?: string;
  socialLinks?: any;
  expertise?: string;
  location?: string;
  isActive: boolean;
  featuredAuthor: boolean;
  articleCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthorFilters {
  isActive?: boolean;
  featuredAuthor?: boolean;
  search?: string;
}

export interface AuthorListOptions {
  page: number;
  limit: number;
  sortBy?: 'name' | 'articleCount' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  filters?: AuthorFilters;
}

export class AuthorRepository {
  constructor(private db: DatabaseType) {}

  async findById(id: string): Promise<Author | null> {
    const result = await this.db
      .select()
      .from(authors)
      .where(eq(authors.id, id))
      .limit(1);

    if (!result[0]) {
      return null;
    }

    const author = result[0];

    // Count published articles for this author
    const articleCountResult = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(articles)
      .where(and(
        eq(articles.authorId, author.id),
        eq(articles.status, 'published')
      ));

    return {
      ...author,
      articleCount: Number(articleCountResult[0]?.count || 0),
    };
  }

  async findBySlug(slug: string): Promise<Author | null> {
    const result = await this.db
      .select()
      .from(authors)
      .where(eq(authors.slug, slug))
      .limit(1);

    if (!result[0]) {
      return null;
    }

    const author = result[0];

    // Count published articles for this author
    const articleCountResult = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(articles)
      .where(and(
        eq(articles.authorId, author.id),
        eq(articles.status, 'published')
      ));

    return {
      ...author,
      articleCount: Number(articleCountResult[0]?.count || 0),
    };
  }

  async list(options: AuthorListOptions): Promise<{ data: Author[]; pagination: any }> {
    const { page, limit } = options;
    
    try {
      // Simple approach: get all authors first
      const allAuthors = await this.db
        .select()
        .from(authors)
        .where(eq(authors.isActive, true))
        .limit(limit);

      // For each author, count their published articles only
      const data = await Promise.all(allAuthors.map(async (author) => {
        const articleCount = await this.db
          .select({ count: sql<number>`COUNT(*)` })
          .from(articles)
          .where(and(
            eq(articles.authorId, author.id),
            eq(articles.status, 'published')
          ));

        return {
          ...author,
          articleCount: articleCount[0]?.count || 0,
        };
      }));

      // Return all active authors (not just those with published articles)
      return {
        data: data,
        pagination: {
          page,
          limit,
          total: data.length,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };
    } catch (error) {
      console.error('❌ Error in AuthorRepository.list:', error);
      throw error;
    }
  }

  async listActive(): Promise<Author[]> {
    return await this.db
      .select()
      .from(authors)
      .where(eq(authors.isActive, true))
      .orderBy(authors.name);
  }

  async listFeatured(): Promise<Author[]> {
    return await this.db
      .select()
      .from(authors)
      .where(and(
        eq(authors.isActive, true),
        eq(authors.featuredAuthor, true)
      ))
      .orderBy(authors.name);
  }

  async create(authorData: Omit<Author, 'id' | 'createdAt' | 'updatedAt'>): Promise<Author> {
    const result = await this.db
      .insert(authors)
      .values({
        ...authorData,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return result[0];
  }

  async update(id: string, authorData: Partial<Omit<Author, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Author | null> {
    const result = await this.db
      .update(authors)
      .set({
        ...authorData,
        updatedAt: new Date(),
      })
      .where(eq(authors.id, id))
      .returning();

    return result[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(authors)
      .where(eq(authors.id, id));

    return result.rowCount > 0;
  }

  async incrementArticleCount(id: string): Promise<void> {
    await this.db
      .update(authors)
      .set({
        articleCount: sql`${authors.articleCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(authors.id, id));
  }

  async decrementArticleCount(id: string): Promise<void> {
    await this.db
      .update(authors)
      .set({
        articleCount: sql`GREATEST(${authors.articleCount} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(authors.id, id));
  }

  private buildWhereConditions(filters: AuthorFilters) {
    const conditions = [];

    if (filters.isActive !== undefined) {
      conditions.push(eq(authors.isActive, filters.isActive));
    }

    if (filters.featuredAuthor !== undefined) {
      conditions.push(eq(authors.featuredAuthor, filters.featuredAuthor));
    }

    if (filters.search) {
      conditions.push(
        like(authors.name, `%${filters.search}%`)
      );
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  private buildOrderBy(sortBy: string, sortOrder: 'asc' | 'desc') {
    const column = authors[sortBy as keyof typeof authors];
    if (!column) {
      return authors.name;
    }

    return sortOrder === 'desc' ? desc(column) : column;
  }
}
