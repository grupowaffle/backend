/**
 * Serviço de gestão de conteúdo em destaque
 * Gerencia artigos featured, posições, prioridades e categorização
 */

import { DatabaseType } from '../repositories/BaseRepository';
import { ArticleRepository } from '../repositories/ArticleRepository';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { generateId } from '../lib/cuid';
import { eq, and, desc, asc, count, sql, inArray, isNull, isNotNull } from 'drizzle-orm';
import { articles, featuredContent, categories, featuredPositions } from '../config/db/schema';

export type FeaturedType = 
  | 'hero_main'           // Banner principal (1 artigo)
  | 'hero_secondary'      // Banners secundários (2-3 artigos)
  | 'trending_now'        // Em alta agora (5-8 artigos)
  | 'editors_pick'        // Escolha do editor (3-5 artigos)
  | 'category_featured'   // Destaque por categoria
  | 'breaking_news'       // Notícias de última hora
  | 'most_read'           // Mais lidos
  | 'recommended'         // Recomendados
  | 'spotlight';          // Holofote/Especiais

export type FeaturedPosition = 
  | 'homepage_main'       // Página inicial - principal
  | 'homepage_secondary'  // Página inicial - secundário
  | 'homepage_sidebar'    // Página inicial - lateral
  | 'category_header'     // Topo da categoria
  | 'category_sidebar'    // Lateral da categoria
  | 'article_related'     // Artigos relacionados
  | 'newsletter_featured' // Featured na newsletter
  | 'mobile_featured'     // Mobile destaque
  | 'search_featured';    // Destaque na busca

export interface FeaturedContentItem {
  id: string;
  articleId: string;
  featuredType: FeaturedType;
  position: FeaturedPosition;
  priority: number;
  categoryId?: string;
  startDate?: Date;
  endDate?: Date;
  isActive: boolean;
  customTitle?: string;
  customDescription?: string;
  customImageUrl?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  
  // Dados do artigo associado (join)
  article?: {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    content: any;
    imageUrl?: string;
    status: string;
    publishedAt?: Date;
    authorId: string;
    categoryId?: string;
    tags?: string[];
    views: number;
    likes: number;
    shares: number;
  };
  
  // Dados da categoria (se aplicável)
  category?: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface FeaturedContentStats {
  totalFeatured: number;
  activeCount: number;
  expiredCount: number;
  byType: Record<FeaturedType, number>;
  byPosition: Record<FeaturedPosition, number>;
  topPerformingFeatured: FeaturedContentItem[];
  recentlyAdded: FeaturedContentItem[];
}

export interface FeaturedContentQuery {
  featuredType?: FeaturedType | FeaturedType[];
  position?: FeaturedPosition | FeaturedPosition[];
  categoryId?: string;
  isActive?: boolean;
  includeExpired?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'priority' | 'createdAt' | 'updatedAt' | 'views' | 'likes';
  sortOrder?: 'asc' | 'desc';
}

export class FeaturedContentService {
  private db: DatabaseType;
  private articleRepository: ArticleRepository;
  private categoryRepository: CategoryRepository;

  constructor(db: DatabaseType) {
    this.db = db;
    this.articleRepository = new ArticleRepository(db);
    this.categoryRepository = new CategoryRepository(db);
  }

  /**
   * Adicionar artigo como featured
   */
  async addFeaturedContent(
    data: {
      articleId: string;
      featuredType: FeaturedType;
      position: FeaturedPosition;
      priority?: number;
      categoryId?: string;
      startDate?: Date;
      endDate?: Date;
      customTitle?: string;
      customDescription?: string;
      customImageUrl?: string;
      metadata?: Record<string, any>;
      createdBy: string;
    }
  ): Promise<{ success: boolean; message: string; featured?: FeaturedContentItem }> {
    try {
      console.log(`⭐ Adding featured content: ${data.articleId} as ${data.featuredType}`);

      // Verificar se o artigo existe
      const article = await this.articleRepository.findById(data.articleId);
      if (!article) {
        return { success: false, message: 'Artigo não encontrado' };
      }

      // Verificar se já não está featured na mesma posição/tipo
      const existing = await this.db
        .select()
        .from(featuredContent)
        .where(
          and(
            eq(featuredContent.articleId, data.articleId),
            eq(featuredContent.featuredType, data.featuredType),
            eq(featuredContent.position, data.position),
            eq(featuredContent.isActive, true)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        return { success: false, message: 'Artigo já está featured nesta posição' };
      }

      // Determinar prioridade automaticamente se não fornecida
      let priority = data.priority;
      if (!priority) {
        const maxPriority = await this.db
          .select({ max: sql<number>`max(${featuredContent.priority})` })
          .from(featuredContent)
          .where(
            and(
              eq(featuredContent.featuredType, data.featuredType),
              eq(featuredContent.position, data.position),
              eq(featuredContent.isActive, true)
            )
          );

        priority = (maxPriority[0]?.max || 0) + 1;
      }

      // Criar featured content
      const featuredId = generateId();
      const now = new Date();

      const [newFeatured] = await this.db
        .insert(featuredContent)
        .values({
          id: featuredId,
          articleId: data.articleId,
          featuredType: data.featuredType,
          position: data.position,
          priority,
          categoryId: data.categoryId,
          startDate: data.startDate || now,
          endDate: data.endDate,
          isActive: true,
          customTitle: data.customTitle,
          customDescription: data.customDescription,
          customImageUrl: data.customImageUrl,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
          createdAt: now,
          updatedAt: now,
          createdBy: data.createdBy,
          updatedBy: data.createdBy,
        })
        .returning();

      // Buscar dados completos
      const featuredWithDetails = await this.getFeaturedContentById(featuredId);

      console.log(`✅ Featured content added successfully: ${featuredId}`);

      return {
        success: true,
        message: 'Conteúdo adicionado aos destaques com sucesso',
        featured: featuredWithDetails,
      };

    } catch (error) {
      console.error('Error adding featured content:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao adicionar aos destaques',
      };
    }
  }

  /**
   * Buscar conteúdo featured por ID
   */
  async getFeaturedContentById(id: string): Promise<FeaturedContentItem | null> {
    try {
      const result = await this.db
        .select({
          // Featured content data
          id: featuredContent.id,
          articleId: featuredContent.articleId,
          featuredType: featuredContent.featuredType,
          position: featuredContent.position,
          priority: featuredContent.priority,
          categoryId: featuredContent.categoryId,
          startDate: featuredContent.startDate,
          endDate: featuredContent.endDate,
          isActive: featuredContent.isActive,
          customTitle: featuredContent.customTitle,
          customDescription: featuredContent.customDescription,
          customImageUrl: featuredContent.customImageUrl,
          metadata: featuredContent.metadata,
          createdAt: featuredContent.createdAt,
          updatedAt: featuredContent.updatedAt,
          createdBy: featuredContent.createdBy,
          updatedBy: featuredContent.updatedBy,
          
          // Article data
          articleTitle: articles.title,
          articleSlug: articles.slug,
          articleExcerpt: articles.excerpt,
          articleContent: articles.content,
          articleImageUrl: articles.imageUrl,
          articleStatus: articles.status,
          articlePublishedAt: articles.publishedAt,
          articleAuthorId: articles.authorId,
          articleCategoryId: articles.categoryId,
          articleTags: articles.tags,
          articleViews: articles.views,
          articleLikes: articles.likes,
          articleShares: articles.shares,
          
          // Category data
          categoryName: categories.name,
          categorySlug: categories.slug,
        })
        .from(featuredContent)
        .leftJoin(articles, eq(featuredContent.articleId, articles.id))
        .leftJoin(categories, eq(featuredContent.categoryId, categories.id))
        .where(eq(featuredContent.id, id))
        .limit(1);

      if (!result[0]) return null;

      const row = result[0];
      
      return this.mapRowToFeaturedItem(row);

    } catch (error) {
      console.error('Error getting featured content by ID:', error);
      return null;
    }
  }

  /**
   * Listar conteúdo featured com filtros
   */
  async listFeaturedContent(
    query: FeaturedContentQuery = {}
  ): Promise<{ items: FeaturedContentItem[]; total: number; pagination: any }> {
    try {
      const {
        featuredType,
        position,
        categoryId,
        isActive = true,
        includeExpired = false,
        limit = 20,
        offset = 0,
        sortBy = 'priority',
        sortOrder = 'asc',
      } = query;

      // Construir WHERE clause
      const conditions = [];
      
      if (featuredType) {
        const types = Array.isArray(featuredType) ? featuredType : [featuredType];
        conditions.push(inArray(featuredContent.featuredType, types));
      }
      
      if (position) {
        const positions = Array.isArray(position) ? position : [position];
        conditions.push(inArray(featuredContent.position, positions));
      }
      
      if (categoryId) {
        conditions.push(eq(featuredContent.categoryId, categoryId));
      }
      
      if (isActive !== undefined) {
        conditions.push(eq(featuredContent.isActive, isActive));
      }

      // Filtrar por data de expiração
      if (!includeExpired) {
        const now = new Date();
        conditions.push(
          sql`(${featuredContent.endDate} IS NULL OR ${featuredContent.endDate} > ${now})`
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Determinar ordenação
      let orderBy;
      switch (sortBy) {
        case 'priority':
          orderBy = sortOrder === 'asc' ? asc(featuredContent.priority) : desc(featuredContent.priority);
          break;
        case 'createdAt':
          orderBy = sortOrder === 'asc' ? asc(featuredContent.createdAt) : desc(featuredContent.createdAt);
          break;
        case 'updatedAt':
          orderBy = sortOrder === 'asc' ? asc(featuredContent.updatedAt) : desc(featuredContent.updatedAt);
          break;
        case 'views':
          orderBy = sortOrder === 'asc' ? asc(articles.views) : desc(articles.views);
          break;
        case 'likes':
          orderBy = sortOrder === 'asc' ? asc(articles.likes) : desc(articles.likes);
          break;
        default:
          orderBy = asc(featuredContent.priority);
      }

      // Query principal
      const results = await this.db
        .select({
          // Featured content data
          id: featuredContent.id,
          articleId: featuredContent.articleId,
          featuredType: featuredContent.featuredType,
          position: featuredContent.position,
          priority: featuredContent.priority,
          categoryId: featuredContent.categoryId,
          startDate: featuredContent.startDate,
          endDate: featuredContent.endDate,
          isActive: featuredContent.isActive,
          customTitle: featuredContent.customTitle,
          customDescription: featuredContent.customDescription,
          customImageUrl: featuredContent.customImageUrl,
          metadata: featuredContent.metadata,
          createdAt: featuredContent.createdAt,
          updatedAt: featuredContent.updatedAt,
          createdBy: featuredContent.createdBy,
          updatedBy: featuredContent.updatedBy,
          
          // Article data
          articleTitle: articles.title,
          articleSlug: articles.slug,
          articleExcerpt: articles.excerpt,
          articleContent: articles.content,
          articleImageUrl: articles.imageUrl,
          articleStatus: articles.status,
          articlePublishedAt: articles.publishedAt,
          articleAuthorId: articles.authorId,
          articleCategoryId: articles.categoryId,
          articleTags: articles.tags,
          articleViews: articles.views,
          articleLikes: articles.likes,
          articleShares: articles.shares,
          
          // Category data
          categoryName: categories.name,
          categorySlug: categories.slug,
        })
        .from(featuredContent)
        .leftJoin(articles, eq(featuredContent.articleId, articles.id))
        .leftJoin(categories, eq(featuredContent.categoryId, categories.id))
        .where(whereClause)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      // Contar total
      const [{ count: total }] = await this.db
        .select({ count: count() })
        .from(featuredContent)
        .leftJoin(articles, eq(featuredContent.articleId, articles.id))
        .where(whereClause);

      const items = results.map(row => this.mapRowToFeaturedItem(row));

      return {
        items,
        total: Number(total),
        pagination: {
          limit,
          offset,
          total: Number(total),
          totalPages: Math.ceil(Number(total) / limit),
          page: Math.floor(offset / limit) + 1,
        },
      };

    } catch (error) {
      console.error('Error listing featured content:', error);
      return { items: [], total: 0, pagination: { limit, offset, total: 0, totalPages: 0, page: 1 } };
    }
  }

  /**
   * Atualizar featured content
   */
  async updateFeaturedContent(
    id: string,
    data: {
      priority?: number;
      startDate?: Date;
      endDate?: Date;
      isActive?: boolean;
      customTitle?: string;
      customDescription?: string;
      customImageUrl?: string;
      metadata?: Record<string, any>;
      updatedBy: string;
    }
  ): Promise<{ success: boolean; message: string; featured?: FeaturedContentItem }> {
    try {
      console.log(`✏️ Updating featured content: ${id}`);

      const updateData: any = {
        updatedAt: new Date(),
        updatedBy: data.updatedBy,
      };

      if (data.priority !== undefined) updateData.priority = data.priority;
      if (data.startDate !== undefined) updateData.startDate = data.startDate;
      if (data.endDate !== undefined) updateData.endDate = data.endDate;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      if (data.customTitle !== undefined) updateData.customTitle = data.customTitle;
      if (data.customDescription !== undefined) updateData.customDescription = data.customDescription;
      if (data.customImageUrl !== undefined) updateData.customImageUrl = data.customImageUrl;
      if (data.metadata !== undefined) updateData.metadata = JSON.stringify(data.metadata);

      const [updated] = await this.db
        .update(featuredContent)
        .set(updateData)
        .where(eq(featuredContent.id, id))
        .returning();

      if (!updated) {
        return { success: false, message: 'Conteúdo featured não encontrado' };
      }

      const featuredWithDetails = await this.getFeaturedContentById(id);

      console.log(`✅ Featured content updated: ${id}`);

      return {
        success: true,
        message: 'Conteúdo featured atualizado com sucesso',
        featured: featuredWithDetails,
      };

    } catch (error) {
      console.error('Error updating featured content:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao atualizar featured content',
      };
    }
  }

  /**
   * Remover do destaque
   */
  async removeFeaturedContent(
    id: string,
    removedBy: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🗑️ Removing featured content: ${id}`);

      const [deleted] = await this.db
        .delete(featuredContent)
        .where(eq(featuredContent.id, id))
        .returning();

      if (!deleted) {
        return { success: false, message: 'Conteúdo featured não encontrado' };
      }

      console.log(`✅ Featured content removed: ${id}`);

      return {
        success: true,
        message: 'Conteúdo removido dos destaques',
      };

    } catch (error) {
      console.error('Error removing featured content:', error);
      return {
        success: false,
        message: 'Erro ao remover dos destaques',
      };
    }
  }

  /**
   * Reordenar prioridades
   */
  async reorderFeaturedContent(
    items: { id: string; priority: number }[],
    updatedBy: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🔄 Reordering ${items.length} featured items`);

      const updatePromises = items.map(item =>
        this.db
          .update(featuredContent)
          .set({
            priority: item.priority,
            updatedAt: new Date(),
            updatedBy,
          })
          .where(eq(featuredContent.id, item.id))
      );

      await Promise.all(updatePromises);

      console.log(`✅ Featured content reordered successfully`);

      return {
        success: true,
        message: 'Ordem dos destaques atualizada',
      };

    } catch (error) {
      console.error('Error reordering featured content:', error);
      return {
        success: false,
        message: 'Erro ao reordenar destaques',
      };
    }
  }

  /**
   * Obter estatísticas de featured content
   */
  async getFeaturedContentStats(): Promise<FeaturedContentStats> {
    try {
      // Contagens básicas
      const [totalCount] = await this.db
        .select({ count: count() })
        .from(featuredContent);

      const [activeCount] = await this.db
        .select({ count: count() })
        .from(featuredContent)
        .where(eq(featuredContent.isActive, true));

      const now = new Date();
      const [expiredCount] = await this.db
        .select({ count: count() })
        .from(featuredContent)
        .where(
          and(
            isNotNull(featuredContent.endDate),
            sql`${featuredContent.endDate} < ${now}`
          )
        );

      // Contagem por tipo
      const typeStats = await this.db
        .select({
          type: featuredContent.featuredType,
          count: count(),
        })
        .from(featuredContent)
        .where(eq(featuredContent.isActive, true))
        .groupBy(featuredContent.featuredType);

      const byType: Record<FeaturedType, number> = {
        hero_main: 0,
        hero_secondary: 0,
        trending_now: 0,
        editors_pick: 0,
        category_featured: 0,
        breaking_news: 0,
        most_read: 0,
        recommended: 0,
        spotlight: 0,
      };

      typeStats.forEach(stat => {
        if (stat.type in byType) {
          byType[stat.type as FeaturedType] = Number(stat.count);
        }
      });

      // Contagem por posição
      const positionStats = await this.db
        .select({
          position: featuredContent.position,
          count: count(),
        })
        .from(featuredContent)
        .where(eq(featuredContent.isActive, true))
        .groupBy(featuredContent.position);

      const byPosition: Record<FeaturedPosition, number> = {
        homepage_main: 0,
        homepage_secondary: 0,
        homepage_sidebar: 0,
        category_header: 0,
        category_sidebar: 0,
        article_related: 0,
        newsletter_featured: 0,
        mobile_featured: 0,
        search_featured: 0,
      };

      positionStats.forEach(stat => {
        if (stat.position in byPosition) {
          byPosition[stat.position as FeaturedPosition] = Number(stat.count);
        }
      });

      // Top performing featured (por views)
      const { items: topPerformingFeatured } = await this.listFeaturedContent({
        isActive: true,
        sortBy: 'views',
        sortOrder: 'desc',
        limit: 10,
      });

      // Recentemente adicionados
      const { items: recentlyAdded } = await this.listFeaturedContent({
        sortBy: 'createdAt',
        sortOrder: 'desc',
        limit: 10,
      });

      return {
        totalFeatured: Number(totalCount.count),
        activeCount: Number(activeCount.count),
        expiredCount: Number(expiredCount.count),
        byType,
        byPosition,
        topPerformingFeatured,
        recentlyAdded,
      };

    } catch (error) {
      console.error('Error getting featured content stats:', error);
      return {
        totalFeatured: 0,
        activeCount: 0,
        expiredCount: 0,
        byType: {} as Record<FeaturedType, number>,
        byPosition: {} as Record<FeaturedPosition, number>,
        topPerformingFeatured: [],
        recentlyAdded: [],
      };
    }
  }

  /**
   * Limpar featured content expirado
   */
  async cleanupExpiredFeatured(): Promise<{ removed: number; errors: string[] }> {
    try {
      console.log('🧹 Cleaning up expired featured content');

      const now = new Date();
      const expired = await this.db
        .delete(featuredContent)
        .where(
          and(
            isNotNull(featuredContent.endDate),
            sql`${featuredContent.endDate} < ${now}`
          )
        )
        .returning();

      console.log(`✅ Cleaned up ${expired.length} expired featured items`);

      return {
        removed: expired.length,
        errors: [],
      };

    } catch (error) {
      console.error('Error cleaning up expired featured content:', error);
      return {
        removed: 0,
        errors: ['Erro na limpeza de conteúdo expirado'],
      };
    }
  }

  /**
   * Mapear row do banco para FeaturedContentItem
   */
  private mapRowToFeaturedItem(row: any): FeaturedContentItem {
    return {
      id: row.id,
      articleId: row.articleId,
      featuredType: row.featuredType,
      position: row.position,
      priority: row.priority,
      categoryId: row.categoryId,
      startDate: row.startDate,
      endDate: row.endDate,
      isActive: row.isActive,
      customTitle: row.customTitle,
      customDescription: row.customDescription,
      customImageUrl: row.customImageUrl,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      
      // Article data (se disponível)
      article: row.articleTitle ? {
        id: row.articleId,
        title: row.articleTitle,
        slug: row.articleSlug,
        excerpt: row.articleExcerpt,
        content: row.articleContent,
        imageUrl: row.articleImageUrl,
        status: row.articleStatus,
        publishedAt: row.articlePublishedAt,
        authorId: row.articleAuthorId,
        categoryId: row.articleCategoryId,
        tags: row.articleTags,
        views: row.articleViews || 0,
        likes: row.articleLikes || 0,
        shares: row.articleShares || 0,
      } : undefined,
      
      // Category data (se disponível)
      category: row.categoryName ? {
        id: row.categoryId,
        name: row.categoryName,
        slug: row.categorySlug,
      } : undefined,
    };
  }
}