/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck - Drizzle ORM type issues
import { DatabaseType } from './BaseRepository';
import { tags, articleTags } from '../config/db/schema';
import { eq, desc, and, like, sql, count, inArray } from 'drizzle-orm';
import { BaseRepository } from './BaseRepository';

export interface Tag {
  id: string;
  name: string;
  slug: string;
  color?: string;
  description?: string;
  isActive: boolean;
  useCount: number;
  articleCount?: number; // Contagem de artigos associados a esta tag
  createdAt: Date;
  updatedAt: Date;
}

export interface TagFilters {
  isActive?: boolean;
  search?: string;
  minUseCount?: number;
}

export interface TagListOptions {
  page: number;
  limit: number;
  sortBy?: 'name' | 'useCount' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  filters?: TagFilters;
}

export class TagRepository extends BaseRepository {
  constructor(db: DatabaseType) {
    super(db);
  }

  async findById(id: string): Promise<Tag | null> {
    // @ts-ignore - Drizzle ORM type issue
    const result = await this.db
      .select()
      .from(tags)
      .where(eq(tags.id, id))
      .limit(1);

    return result[0] || null;
  }

  async findBySlug(slug: string): Promise<Tag | null> {
    // @ts-ignore - Drizzle ORM type issue
    const result = await this.db
      .select()
      .from(tags)
      .where(eq(tags.slug, slug))
      .limit(1);

    return result[0] || null;
  }

  async findByName(name: string): Promise<Tag | null> {
    // @ts-ignore - Drizzle ORM type issue
    const result = await this.db
      .select()
      .from(tags)
      .where(eq(tags.name, name))
      .limit(1);

    return result[0] || null;
  }

  async findByNames(names: string[]): Promise<Tag[]> {
    if (names.length === 0) return [];

    // @ts-ignore - Drizzle ORM type issue
    return await this.db
      .select()
      .from(tags)
      .where(inArray(tags.name, names));
  }

  async list(options: TagListOptions): Promise<{ data: Tag[]; pagination: any }> {
    const { page, limit, sortBy = 'name', sortOrder = 'asc', filters = {} } = options;
    const offset = (page - 1) * limit;

    // Build where conditions
    const whereConditions = this.buildWhereConditions(filters);

    // Build order by
    const orderBy = this.buildOrderBy(sortBy, sortOrder);

    // Get total count
    // @ts-ignore - Drizzle ORM type issue
    const totalResult = await this.db
      .select({ count: count() })
      .from(tags)
      .where(whereConditions || undefined);

    const total = totalResult[0]?.count || 0;

    // Get tags
    // @ts-ignore - Drizzle ORM type issue
    const tagsData = await this.db
      .select()
      .from(tags)
      .where(whereConditions || undefined)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // Para cada tag, calcular a contagem de artigos
    const data = await Promise.all(tagsData.map(async (tag) => {
      // @ts-ignore - Drizzle ORM type issue
      const articleCountResult = await this.db
        .select({ count: count() })
        .from(articleTags)
        .where(eq(articleTags.tagId, tag.id));

      const result = {
        ...tag,
        articleCount: articleCountResult[0]?.count || 0,
      };
      
      // Debug: log para verificar se articleCount está sendo calculado
      if (tag.name === 'Automóveis' || tag.name === 'Ciência') {
        console.log(`🔍 Debug - TagRepository calculando ${tag.name}:`, {
          tagId: tag.id,
          articleCount: result.articleCount,
          useCount: tag.useCount
        });
      }
      
      return result;
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async listActive(): Promise<Tag[]> {
    // @ts-ignore - Drizzle ORM type issue
    return await this.db
      .select()
      .from(tags)
      .where(eq(tags.isActive, true))
      .orderBy(tags.name);
  }

  async listPopular(limit: number = 20): Promise<Tag[]> {
    // @ts-ignore - Drizzle ORM type issue
    const tagsData = await this.db
      .select()
      .from(tags)
      .where(eq(tags.isActive, true))
      .orderBy(desc(tags.useCount))
      .limit(limit);

    // Para cada tag, calcular a contagem de artigos
    return await Promise.all(tagsData.map(async (tag) => {
      // @ts-ignore - Drizzle ORM type issue
      const articleCountResult = await this.db
        .select({ count: count() })
        .from(articleTags)
        .where(eq(articleTags.tagId, tag.id));

      return {
        ...tag,
        articleCount: articleCountResult[0]?.count || 0,
      };
    }));
  }

  async create(tagData: Omit<Tag, 'id' | 'createdAt' | 'updatedAt'>): Promise<Tag> {
    // @ts-ignore - Drizzle ORM type issue
    const result = await this.db
      .insert(tags)
      .values({
        ...tagData,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return result[0];
  }

  async update(id: string, tagData: Partial<Omit<Tag, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Tag | null> {
    // @ts-ignore - Drizzle ORM type issue
    const result = await this.db
      .update(tags)
      .set({
        ...tagData,
        updatedAt: new Date(),
      })
      .where(eq(tags.id, id))
      .returning();

    return result[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    // @ts-ignore - Drizzle ORM type issue
    const result = await this.db
      .delete(tags)
      .where(eq(tags.id, id));

    return result.rowCount > 0;
  }

  async incrementUseCount(id: string): Promise<void> {
    // @ts-ignore - Drizzle ORM type issue
    await this.db
      .update(tags)
      .set({
        useCount: sql`${tags.useCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(tags.id, id));
  }

  async decrementUseCount(id: string): Promise<void> {
    // @ts-ignore - Drizzle ORM type issue
    await this.db
      .update(tags)
      .set({
        useCount: sql`GREATEST(${tags.useCount} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(tags.id, id));
  }

  async getArticlesByTag(tagId: string, options: { page: number; limit: number }): Promise<{ data: any[]; pagination: any }> {
    const { page, limit } = options;
    const offset = (page - 1) * limit;

    // Get total count of articles with this tag
    // @ts-ignore - Drizzle ORM type issue
    const totalResult = await this.db
      .select({ count: count() })
      .from(articleTags)
      .where(eq(articleTags.tagId, tagId));

    const total = totalResult[0]?.count || 0;

    // Get articles with this tag
    // @ts-ignore - Drizzle ORM type issue
    const data = await this.db
      .select({
        articleId: articleTags.articleId,
        tagId: articleTags.tagId,
        createdAt: articleTags.createdAt,
      })
      .from(articleTags)
      .where(eq(articleTags.tagId, tagId))
      .orderBy(desc(articleTags.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  private buildWhereConditions(filters: TagFilters) {
    const conditions = [];

    if (filters.isActive !== undefined) {
      conditions.push(eq(tags.isActive, filters.isActive));
    }

    if (filters.minUseCount !== undefined) {
      // @ts-ignore - Drizzle ORM type issue
      conditions.push(sql`${tags.useCount} >= ${filters.minUseCount}`);
    }

    if (filters.search) {
      // @ts-ignore - Drizzle ORM type issue
      conditions.push(
        like(tags.name, `%${filters.search}%`)
      );
    }

    // @ts-ignore - Drizzle ORM type issue
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  private buildOrderBy(sortBy: string, sortOrder: 'asc' | 'desc') {
    switch (sortBy) {
      case 'useCount':
        return sortOrder === 'desc' ? desc(tags.useCount) : tags.useCount;
      case 'createdAt':
        return sortOrder === 'desc' ? desc(tags.createdAt) : tags.createdAt;
      default:
        return sortOrder === 'desc' ? desc(tags.name) : tags.name;
    }
  }
}
