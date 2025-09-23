import { eq, and, or, desc, asc, count, isNull, isNotNull, sql } from 'drizzle-orm';
import { BaseRepository, DatabaseType, PaginationOptions, PaginatedResult } from './BaseRepository';
import { categories, Category, NewCategory, articles } from '../config/db/schema';

export class CategoryRepository extends BaseRepository {
  constructor(db: DatabaseType) {
    super(db);
  }

  /**
   * Create a new category
   */
  async create(data: NewCategory): Promise<Category> {
    try {
      const [category] = await this.db
        .insert(categories)
        .values({
          ...data,
          updatedAt: new Date(),
        })
        .returning();

      return category;
    } catch (error) {
      this.handleError(error, 'create category');
      throw error;
    }
  }

  /**
   * Get category by ID
   */
  async findById(id: string): Promise<Category | null> {
    try {
      const result = await this.db
        .select()
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      this.handleError(error, 'find category by id');
      throw error;
    }
  }

  /**
   * Get category by slug
   */
  async findBySlug(slug: string): Promise<Category | null> {
    try {
      const result = await this.db
        .select()
        .from(categories)
        .where(eq(categories.slug, slug))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      this.handleError(error, 'find category by slug');
      throw error;
    }
  }

  /**
   * Update category
   */
  async update(id: string, data: Partial<NewCategory>): Promise<Category | null> {
    try {
      const [category] = await this.db
        .update(categories)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(categories.id, id))
        .returning();

      return category || null;
    } catch (error) {
      this.handleError(error, 'update category');
      throw error;
    }
  }

  /**
   * Delete category
   */
  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(categories)
        .where(eq(categories.id, id))
        .returning();

      return result.length > 0;
    } catch (error) {
      this.handleError(error, 'delete category');
      throw error;
    }
  }

  /**
   * List all categories
   */
  async list(options: PaginationOptions = {}): Promise<Category[]> {
    try {
      let query = this.db
        .select()
        .from(categories)
        .where(eq(categories.isActive, true));

      // Apply sorting
      query = this.applySorting(query, categories, {
        sortBy: options.sortBy || 'order',
        sortOrder: options.sortOrder || 'asc',
      });

      return await query;
    } catch (error) {
      this.handleError(error, 'list categories');
      throw error;
    }
  }

  /**
   * List all categories with article count
   */
  async listWithArticleCount(options: PaginationOptions = {}): Promise<(Category & { articleCount: number })[]> {
    try {
      let query = this.db
        .select({
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
          description: categories.description,
          parentId: categories.parentId,
          color: categories.color,
          icon: categories.icon,
          order: categories.order,
          isActive: categories.isActive,
          featuredOnHomepage: categories.featuredOnHomepage,
          seoTitle: categories.seoTitle,
          seoDescription: categories.seoDescription,
          createdAt: categories.createdAt,
          updatedAt: categories.updatedAt,
          articleCount: sql<number>`COALESCE(COUNT(${articles.id}), 0)`,
        })
        .from(categories)
        .leftJoin(articles, eq(categories.id, articles.categoryId))
        .where(eq(categories.isActive, true))
        .groupBy(
          categories.id,
          categories.name,
          categories.slug,
          categories.description,
          categories.parentId,
          categories.color,
          categories.icon,
          categories.order,
          categories.isActive,
          categories.featuredOnHomepage,
          categories.seoTitle,
          categories.seoDescription,
          categories.createdAt,
          categories.updatedAt
        );

      // Apply sorting
      const sortBy = options.sortBy || 'order';
      const sortOrder = options.sortOrder || 'asc';
      
      if (sortBy === 'articleCount') {
        query = sortOrder === 'desc' 
          ? query.orderBy(desc(sql`COALESCE(COUNT(${articles.id}), 0)`))
          : query.orderBy(asc(sql`COALESCE(COUNT(${articles.id}), 0)`));
      } else {
        query = this.applySorting(query, categories, { sortBy, sortOrder });
      }

      const result = await query;
      return result.map(row => ({
        ...row,
        articleCount: Number(row.articleCount) || 0,
      }));
    } catch (error) {
      this.handleError(error, 'list categories with article count');
      throw error;
    }
  }

  /**
   * Get parent categories (no parent)
   */
  async listParentCategories(): Promise<Category[]> {
    try {
      return await this.db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.isActive, true),
            isNull(categories.parentId)
          )
        )
        .orderBy(asc(categories.order));
    } catch (error) {
      this.handleError(error, 'list parent categories');
      throw error;
    }
  }

  /**
   * Get subcategories of a parent category
   */
  async listSubcategories(parentId: string): Promise<Category[]> {
    try {
      return await this.db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.isActive, true),
            eq(categories.parentId, parentId)
          )
        )
        .orderBy(asc(categories.order));
    } catch (error) {
      this.handleError(error, 'list subcategories');
      throw error;
    }
  }

  /**
   * Get featured categories (for homepage)
   */
  async listFeaturedCategories(): Promise<Category[]> {
    try {
      return await this.db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.isActive, true),
            eq(categories.featuredOnHomepage, true)
          )
        )
        .orderBy(asc(categories.order));
    } catch (error) {
      this.handleError(error, 'list featured categories');
      throw error;
    }
  }

  /**
   * List active categories (alias for public API)
   */
  async listActive(): Promise<Category[]> {
    return this.list();
  }

  /**
   * Count categories with filters
   */
  async count(filters: Record<string, any> = {}): Promise<number> {
    try {
      let query = this.db
        .select({ count: count() })
        .from(categories);

      if (filters.isActive !== undefined) {
        query = query.where(eq(categories.isActive, filters.isActive));
      }

      const result = await query;
      return result[0]?.count || 0;
    } catch (error) {
      this.handleError(error, 'count categories');
      throw error;
    }
  }

  /**
   * Get category hierarchy (with subcategories)
   */
  async getCategoryHierarchy(): Promise<(Category & { subcategories: Category[] })[]> {
    try {
      const parentCategories = await this.listParentCategories();
      const result = [];

      for (const parent of parentCategories) {
        const subcategories = await this.listSubcategories(parent.id);
        result.push({
          ...parent,
          subcategories,
        });
      }

      return result;
    } catch (error) {
      this.handleError(error, 'get category hierarchy');
      throw error;
    }
  }

  /**
   * Get category statistics
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    featured: number;
    withParent: number;
    withoutParent: number;
  }> {
    try {
      const [totalResult, activeResult, inactiveResult, featuredResult, withParentResult, withoutParentResult] = await Promise.all([
        this.db.select({ count: count() }).from(categories),
        this.db.select({ count: count() }).from(categories).where(eq(categories.isActive, true)),
        this.db.select({ count: count() }).from(categories).where(eq(categories.isActive, false)),
        this.db.select({ count: count() }).from(categories).where(eq(categories.featuredOnHomepage, true)),
        this.db.select({ count: count() }).from(categories).where(isNotNull(categories.parentId)),
        this.db.select({ count: count() }).from(categories).where(isNull(categories.parentId)),
      ]);

      return {
        total: totalResult[0]?.count || 0,
        active: activeResult[0]?.count || 0,
        inactive: inactiveResult[0]?.count || 0,
        featured: featuredResult[0]?.count || 0,
        withParent: withParentResult[0]?.count || 0,
        withoutParent: withoutParentResult[0]?.count || 0,
      };
    } catch (error) {
      this.handleError(error, 'get category stats');
      throw error;
    }
  }
}