/**
 * Serviço de gestão das posições de destaque
 * Gerencia configurações, layouts e limitações das posições featured
 */

import { DatabaseType } from '../repositories/BaseRepository';
import { generateId } from '../lib/cuid';
import { eq, asc, desc } from 'drizzle-orm';
import { featuredPositions } from '../config/db/schema';

export interface FeaturedPositionConfig {
  id: string;
  positionKey: string;
  displayName: string;
  description?: string;
  maxItems: number;
  allowedTypes: string[];
  isActive: boolean;
  sortOrder: number;
  layoutConfig: {
    type: 'grid' | 'carousel' | 'list' | 'banner' | 'sidebar';
    columns?: number;
    rows?: number;
    showThumbnails?: boolean;
    showExcerpts?: boolean;
    showDates?: boolean;
    showAuthors?: boolean;
    itemHeight?: string;
    itemWidth?: string;
    spacing?: string;
    autoplay?: boolean;
    autoplayDelay?: number;
    pagination?: boolean;
    navigation?: boolean;
    responsive?: {
      mobile: { columns?: number; rows?: number };
      tablet: { columns?: number; rows?: number };
      desktop: { columns?: number; rows?: number };
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePositionData {
  positionKey: string;
  displayName: string;
  description?: string;
  maxItems?: number;
  allowedTypes?: string[];
  isActive?: boolean;
  sortOrder?: number;
  layoutConfig?: Partial<FeaturedPositionConfig['layoutConfig']>;
}

export interface UpdatePositionData extends Partial<CreatePositionData> {}

export class FeaturedPositionsService {
  private db: DatabaseType;

  constructor(db: DatabaseType) {
    this.db = db;
  }

  /**
   * Criar nova posição featured
   */
  async createPosition(data: CreatePositionData): Promise<{ success: boolean; message: string; position?: FeaturedPositionConfig }> {
    try {
      console.log(`🎯 Creating new featured position: ${data.positionKey}`);

      // Verificar se a posição já existe
      const existing = await this.db
        .select()
        .from(featuredPositions)
        .where(eq(featuredPositions.positionKey, data.positionKey))
        .limit(1);

      if (existing.length > 0) {
        return { success: false, message: 'Posição com essa chave já existe' };
      }

      // Configuração padrão do layout
      const defaultLayoutConfig = {
        type: 'grid' as const,
        columns: 3,
        rows: 2,
        showThumbnails: true,
        showExcerpts: true,
        showDates: true,
        showAuthors: false,
        spacing: '1rem',
        responsive: {
          mobile: { columns: 1, rows: 4 },
          tablet: { columns: 2, rows: 3 },
          desktop: { columns: 3, rows: 2 },
        },
      };

      const layoutConfig = {
        ...defaultLayoutConfig,
        ...data.layoutConfig,
      };

      // Determinar sortOrder se não fornecido
      let sortOrder = data.sortOrder;
      if (sortOrder === undefined) {
        const maxOrder = await this.db
          .select({ max: featuredPositions.sortOrder })
          .from(featuredPositions)
          .orderBy(desc(featuredPositions.sortOrder))
          .limit(1);

        sortOrder = (maxOrder[0]?.max || 0) + 1;
      }

      const positionId = generateId();
      const now = new Date();

      const [newPosition] = await this.db
        .insert(featuredPositions)
        .values({
          id: positionId,
          positionKey: data.positionKey,
          displayName: data.displayName,
          description: data.description,
          maxItems: data.maxItems || 10,
          allowedTypes: JSON.stringify(data.allowedTypes || []),
          isActive: data.isActive !== undefined ? data.isActive : true,
          sortOrder,
          layoutConfig: JSON.stringify(layoutConfig),
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const position = this.mapRowToPosition(newPosition);

      console.log(`✅ Featured position created: ${positionId}`);

      return {
        success: true,
        message: 'Posição criada com sucesso',
        position,
      };

    } catch (error) {
      console.error('Error creating featured position:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao criar posição',
      };
    }
  }

  /**
   * Listar todas as posições
   */
  async listPositions(options: {
    includeInactive?: boolean;
    sortBy?: 'sortOrder' | 'displayName' | 'createdAt';
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<FeaturedPositionConfig[]> {
    try {
      const { includeInactive = false, sortBy = 'sortOrder', sortOrder: order = 'asc' } = options;

      let query = this.db.select().from(featuredPositions);

      if (!includeInactive) {
        query = query.where(eq(featuredPositions.isActive, true));
      }

      // Aplicar ordenação
      const orderByColumn = featuredPositions[sortBy];
      if (orderByColumn) {
        query = query.orderBy(order === 'asc' ? asc(orderByColumn) : desc(orderByColumn));
      }

      const results = await query;

      return results.map(row => this.mapRowToPosition(row));

    } catch (error) {
      console.error('Error listing featured positions:', error);
      return [];
    }
  }

  /**
   * Obter posição por ID
   */
  async getPositionById(id: string): Promise<FeaturedPositionConfig | null> {
    try {
      const [result] = await this.db
        .select()
        .from(featuredPositions)
        .where(eq(featuredPositions.id, id))
        .limit(1);

      if (!result) return null;

      return this.mapRowToPosition(result);

    } catch (error) {
      console.error('Error getting featured position by ID:', error);
      return null;
    }
  }

  /**
   * Obter posição por chave
   */
  async getPositionByKey(positionKey: string): Promise<FeaturedPositionConfig | null> {
    try {
      const [result] = await this.db
        .select()
        .from(featuredPositions)
        .where(eq(featuredPositions.positionKey, positionKey))
        .limit(1);

      if (!result) return null;

      return this.mapRowToPosition(result);

    } catch (error) {
      console.error('Error getting featured position by key:', error);
      return null;
    }
  }

  /**
   * Atualizar posição
   */
  async updatePosition(
    id: string,
    data: UpdatePositionData
  ): Promise<{ success: boolean; message: string; position?: FeaturedPositionConfig }> {
    try {
      console.log(`✏️ Updating featured position: ${id}`);

      // Verificar se existe
      const existing = await this.getPositionById(id);
      if (!existing) {
        return { success: false, message: 'Posição não encontrada' };
      }

      const updateData: any = {
        updatedAt: new Date(),
      };

      if (data.displayName !== undefined) updateData.displayName = data.displayName;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.maxItems !== undefined) updateData.maxItems = data.maxItems;
      if (data.allowedTypes !== undefined) updateData.allowedTypes = JSON.stringify(data.allowedTypes);
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;

      // Atualizar layout config preservando valores existentes
      if (data.layoutConfig) {
        const currentLayout = existing.layoutConfig;
        const newLayout = {
          ...currentLayout,
          ...data.layoutConfig,
        };
        updateData.layoutConfig = JSON.stringify(newLayout);
      }

      const [updated] = await this.db
        .update(featuredPositions)
        .set(updateData)
        .where(eq(featuredPositions.id, id))
        .returning();

      if (!updated) {
        return { success: false, message: 'Falha ao atualizar posição' };
      }

      const position = this.mapRowToPosition(updated);

      console.log(`✅ Featured position updated: ${id}`);

      return {
        success: true,
        message: 'Posição atualizada com sucesso',
        position,
      };

    } catch (error) {
      console.error('Error updating featured position:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao atualizar posição',
      };
    }
  }

  /**
   * Deletar posição
   */
  async deletePosition(id: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🗑️ Deleting featured position: ${id}`);

      const [deleted] = await this.db
        .delete(featuredPositions)
        .where(eq(featuredPositions.id, id))
        .returning();

      if (!deleted) {
        return { success: false, message: 'Posição não encontrada' };
      }

      console.log(`✅ Featured position deleted: ${id}`);

      return {
        success: true,
        message: 'Posição removida com sucesso',
      };

    } catch (error) {
      console.error('Error deleting featured position:', error);
      return {
        success: false,
        message: 'Erro ao remover posição',
      };
    }
  }

  /**
   * Reordenar posições
   */
  async reorderPositions(
    items: { id: string; sortOrder: number }[]
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🔄 Reordering ${items.length} featured positions`);

      const updatePromises = items.map(item =>
        this.db
          .update(featuredPositions)
          .set({
            sortOrder: item.sortOrder,
            updatedAt: new Date(),
          })
          .where(eq(featuredPositions.id, item.id))
      );

      await Promise.all(updatePromises);

      console.log(`✅ Featured positions reordered successfully`);

      return {
        success: true,
        message: 'Ordem das posições atualizada',
      };

    } catch (error) {
      console.error('Error reordering featured positions:', error);
      return {
        success: false,
        message: 'Erro ao reordenar posições',
      };
    }
  }

  /**
   * Inicializar posições padrão do sistema
   */
  async initializeDefaultPositions(): Promise<{ success: boolean; message: string; created: number }> {
    try {
      console.log('🚀 Initializing default featured positions...');

      const defaultPositions: CreatePositionData[] = [
        {
          positionKey: 'homepage_main',
          displayName: 'Homepage - Banner Principal',
          description: 'Banner hero da página inicial',
          maxItems: 1,
          allowedTypes: ['hero_main'],
          sortOrder: 1,
          layoutConfig: {
            type: 'banner',
            showThumbnails: true,
            showExcerpts: true,
            showDates: true,
            showAuthors: true,
          },
        },
        {
          positionKey: 'homepage_secondary',
          displayName: 'Homepage - Banners Secundários',
          description: 'Banners secundários da página inicial',
          maxItems: 3,
          allowedTypes: ['hero_secondary'],
          sortOrder: 2,
          layoutConfig: {
            type: 'grid',
            columns: 3,
            rows: 1,
            showThumbnails: true,
            showExcerpts: true,
            responsive: {
              mobile: { columns: 1, rows: 3 },
              tablet: { columns: 2, rows: 2 },
              desktop: { columns: 3, rows: 1 },
            },
          },
        },
        {
          positionKey: 'homepage_sidebar',
          displayName: 'Homepage - Lateral',
          description: 'Área lateral da página inicial',
          maxItems: 5,
          allowedTypes: ['trending_now', 'most_read'],
          sortOrder: 3,
          layoutConfig: {
            type: 'list',
            showThumbnails: true,
            showExcerpts: false,
            showDates: true,
            itemHeight: '60px',
          },
        },
        {
          positionKey: 'category_header',
          displayName: 'Categoria - Cabeçalho',
          description: 'Topo das páginas de categoria',
          maxItems: 1,
          allowedTypes: ['category_featured'],
          sortOrder: 4,
          layoutConfig: {
            type: 'banner',
            showThumbnails: true,
            showExcerpts: true,
          },
        },
        {
          positionKey: 'category_sidebar',
          displayName: 'Categoria - Lateral',
          description: 'Lateral das páginas de categoria',
          maxItems: 4,
          allowedTypes: ['recommended', 'editors_pick'],
          sortOrder: 5,
          layoutConfig: {
            type: 'list',
            showThumbnails: true,
            showExcerpts: false,
          },
        },
        {
          positionKey: 'article_related',
          displayName: 'Artigo - Relacionados',
          description: 'Artigos relacionados no final dos posts',
          maxItems: 6,
          allowedTypes: ['recommended', 'category_featured'],
          sortOrder: 6,
          layoutConfig: {
            type: 'grid',
            columns: 3,
            rows: 2,
            showThumbnails: true,
            showExcerpts: true,
            responsive: {
              mobile: { columns: 1, rows: 6 },
              tablet: { columns: 2, rows: 3 },
              desktop: { columns: 3, rows: 2 },
            },
          },
        },
        {
          positionKey: 'newsletter_featured',
          displayName: 'Newsletter - Destaque',
          description: 'Artigos em destaque na newsletter',
          maxItems: 3,
          allowedTypes: ['editors_pick', 'breaking_news'],
          sortOrder: 7,
          layoutConfig: {
            type: 'list',
            showThumbnails: true,
            showExcerpts: true,
            showAuthors: true,
          },
        },
        {
          positionKey: 'mobile_featured',
          displayName: 'Mobile - Destaque',
          description: 'Seção especial para dispositivos móveis',
          maxItems: 4,
          allowedTypes: ['trending_now', 'breaking_news'],
          sortOrder: 8,
          layoutConfig: {
            type: 'carousel',
            showThumbnails: true,
            showExcerpts: false,
            autoplay: true,
            autoplayDelay: 4000,
            pagination: true,
          },
        },
        {
          positionKey: 'search_featured',
          displayName: 'Busca - Destaque',
          description: 'Resultados em destaque na busca',
          maxItems: 2,
          allowedTypes: ['spotlight', 'trending_now'],
          sortOrder: 9,
          layoutConfig: {
            type: 'grid',
            columns: 2,
            rows: 1,
            showThumbnails: true,
            showExcerpts: true,
          },
        },
      ];

      let created = 0;
      const errors: string[] = [];

      for (const positionData of defaultPositions) {
        try {
          // Verificar se já existe
          const existing = await this.getPositionByKey(positionData.positionKey);
          if (!existing) {
            const result = await this.createPosition(positionData);
            if (result.success) {
              created++;
            } else {
              errors.push(`${positionData.positionKey}: ${result.message}`);
            }
          } else {
            console.log(`⏭️ Skipping existing position: ${positionData.positionKey}`);
          }
        } catch (error) {
          errors.push(`${positionData.positionKey}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      console.log(`✅ Default positions initialized: ${created} created, ${errors.length} errors`);

      return {
        success: errors.length === 0,
        message: `${created} posições padrão criadas${errors.length > 0 ? `, ${errors.length} erros` : ''}`,
        created,
      };

    } catch (error) {
      console.error('Error initializing default positions:', error);
      return {
        success: false,
        message: 'Erro ao inicializar posições padrão',
        created: 0,
      };
    }
  }

  /**
   * Obter configurações de posições por chaves
   */
  async getPositionsByKeys(keys: string[]): Promise<FeaturedPositionConfig[]> {
    try {
      if (keys.length === 0) return [];

      const results = await this.db
        .select()
        .from(featuredPositions)
        .where(
          featuredPositions.positionKey.in ? 
            featuredPositions.positionKey.in(keys) : 
            // Fallback se 'in' não estiver disponível
            eq(featuredPositions.isActive, true)
        )
        .orderBy(asc(featuredPositions.sortOrder));

      // Filtrar manualmente se não temos acesso ao 'in' operator
      const filtered = results.filter(row => keys.includes(row.positionKey));

      return filtered.map(row => this.mapRowToPosition(row));

    } catch (error) {
      console.error('Error getting positions by keys:', error);
      return [];
    }
  }

  /**
   * Mapear row do banco para FeaturedPositionConfig
   */
  private mapRowToPosition(row: any): FeaturedPositionConfig {
    return {
      id: row.id,
      positionKey: row.positionKey,
      displayName: row.displayName,
      description: row.description,
      maxItems: row.maxItems,
      allowedTypes: row.allowedTypes ? JSON.parse(row.allowedTypes) : [],
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      layoutConfig: row.layoutConfig ? JSON.parse(row.layoutConfig) : {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}