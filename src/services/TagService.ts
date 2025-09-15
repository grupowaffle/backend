/**
 * Serviço de gestão de tags
 * Implementa autocomplete, sugestões e associações com artigos
 */

import { DatabaseType } from '../repositories/BaseRepository';
import { generateId } from '../lib/cuid';
import { eq, sql, ilike, desc, asc, and } from 'drizzle-orm';
import { tags, articleTags } from '../config/db/schema';

export interface TagData {
  id?: string;
  name: string;
  slug: string;
  description?: string;
  color?: string;
  useCount: number;
  isActive: boolean;
}

export interface TagSuggestion {
  tag: string;
  score: number;
  reason: 'content' | 'title' | 'category' | 'similar';
}

export class TagService {
  private db: DatabaseType;

  constructor(db: DatabaseType) {
    this.db = db;
  }

  /**
   * Create or get existing tag
   */
  async createOrGetTag(name: string): Promise<TagData> {
    const normalizedName = this.normalizeTagName(name);
    const slug = this.generateSlug(normalizedName);

    try {
      // Try to find existing tag
      const [existing] = await this.db
        .select()
        .from(tags)
        .where(eq(tags.slug, slug))
        .limit(1);

      if (existing) {
        return existing;
      }

      // Create new tag
      const [newTag] = await this.db
        .insert(tags)
        .values({
          id: generateId(),
          name: normalizedName,
          slug,
          useCount: 0,
          isActive: true,
        })
        .returning();

      console.log(`🏷️ Created new tag: ${normalizedName}`);
      return newTag;
    } catch (error) {
      console.error('Error creating tag:', error);
      throw error;
    }
  }

  /**
   * Search tags for autocomplete
   */
  async searchTags(query: string, limit = 10): Promise<TagData[]> {
    if (!query || query.length < 2) return [];

    try {
      const searchQuery = `%${query.toLowerCase()}%`;
      
      const results = await this.db
        .select()
        .from(tags)
        .where(
          and(
            ilike(tags.name, searchQuery),
            eq(tags.isActive, true)
          )
        )
        .orderBy(desc(tags.useCount), asc(tags.name))
        .limit(limit);

      return results;
    } catch (error) {
      console.error('Error searching tags:', error);
      return [];
    }
  }

  /**
   * Get popular tags
   */
  async getPopularTags(limit = 20): Promise<TagData[]> {
    try {
      const results = await this.db
        .select()
        .from(tags)
        .where(eq(tags.isActive, true))
        .orderBy(desc(tags.useCount), asc(tags.name))
        .limit(limit);

      return results;
    } catch (error) {
      console.error('Error getting popular tags:', error);
      return [];
    }
  }

  /**
   * Get all tags with usage statistics
   */
  async getAllTags(): Promise<TagData[]> {
    try {
      const results = await this.db
        .select()
        .from(tags)
        .orderBy(asc(tags.name));

      return results;
    } catch (error) {
      console.error('Error getting all tags:', error);
      return [];
    }
  }

  /**
   * Get tag by ID
   */
  async getTagById(id: string): Promise<TagData | null> {
    try {
      const [tag] = await this.db
        .select()
        .from(tags)
        .where(eq(tags.id, id))
        .limit(1);

      return tag || null;
    } catch (error) {
      console.error('Error getting tag by ID:', error);
      return null;
    }
  }

  /**
   * Associate tags with article
   */
  async associateTagsWithArticle(articleId: string, tagNames: string[]): Promise<void> {
    if (!tagNames || tagNames.length === 0) return;

    try {
      console.log(`🏷️ Associating ${tagNames.length} tags with article ${articleId}`);

      // Remove existing associations
      await this.db
        .delete(articleTags)
        .where(eq(articleTags.articleId, articleId));

      // Create or get tags and associate
      const tagAssociations = [];

      for (const tagName of tagNames) {
        if (!tagName || typeof tagName !== 'string') continue;

        const tag = await this.createOrGetTag(tagName);
        
        tagAssociations.push({
          articleId,
          tagId: tag.id,
          createdAt: new Date(),
        });

        // Increment use count
        await this.incrementTagUsage(tag.id);
      }

      // Insert associations
      if (tagAssociations.length > 0) {
        await this.db
          .insert(articleTags)
          .values(tagAssociations);
      }

      console.log(`✅ Associated ${tagAssociations.length} tags with article`);
    } catch (error) {
      console.error('Error associating tags with article:', error);
      throw error;
    }
  }

  /**
   * Get tags for article
   */
  async getTagsForArticle(articleId: string): Promise<TagData[]> {
    try {
      const results = await this.db
        .select({
          id: tags.id,
          name: tags.name,
          slug: tags.slug,
          description: tags.description,
          color: tags.color,
          useCount: tags.useCount,
          isActive: tags.isActive,
        })
        .from(articleTags)
        .innerJoin(tags, eq(articleTags.tagId, tags.id))
        .where(
          and(
            eq(articleTags.articleId, articleId),
            eq(tags.isActive, true)
          )
        )
        .orderBy(asc(tags.name));

      return results;
    } catch (error) {
      console.error('Error getting tags for article:', error);
      return [];
    }
  }

  /**
   * Suggest tags based on content
   */
  async suggestTags(title: string, content: string, categoryId?: string): Promise<TagSuggestion[]> {
    const suggestions: TagSuggestion[] = [];
    const fullText = (title + ' ' + content).toLowerCase();

    try {
      // Get existing popular tags to check against
      const popularTags = await this.getPopularTags(50);

      // Check which existing tags appear in the content
      for (const tag of popularTags) {
        const tagName = tag.name.toLowerCase();
        
        // Check if tag appears in title (higher score)
        if (title.toLowerCase().includes(tagName)) {
          suggestions.push({
            tag: tag.name,
            score: 10 + tag.useCount / 10,
            reason: 'title',
          });
        }
        // Check if tag appears in content
        else if (fullText.includes(tagName)) {
          suggestions.push({
            tag: tag.name,
            score: 5 + tag.useCount / 20,
            reason: 'content',
          });
        }
      }

      // Add category-based suggestions if available
      if (categoryId) {
        const categoryTags = await this.getTagsForCategory(categoryId);
        
        for (const tag of categoryTags) {
          const existing = suggestions.find(s => s.tag.toLowerCase() === tag.name.toLowerCase());
          if (!existing) {
            suggestions.push({
              tag: tag.name,
              score: 3 + tag.useCount / 30,
              reason: 'category',
            });
          }
        }
      }

      // Generate new tag suggestions from content
      const contentWords = this.extractKeywords(fullText);
      
      for (const word of contentWords.slice(0, 10)) {
        const existing = suggestions.find(s => s.tag.toLowerCase() === word.toLowerCase());
        if (!existing && word.length > 3) {
          suggestions.push({
            tag: this.normalizeTagName(word),
            score: 2,
            reason: 'content',
          });
        }
      }

      // Sort by score and return top suggestions
      return suggestions
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

    } catch (error) {
      console.error('Error suggesting tags:', error);
      return [];
    }
  }

  /**
   * Get tags commonly used with a specific category
   */
  private async getTagsForCategory(categoryId: string): Promise<TagData[]> {
    try {
      // This would require joining with articles table to find tags used in articles of this category
      // For now, return empty array - can be implemented later with actual article-category relationships
      return [];
    } catch (error) {
      console.error('Error getting tags for category:', error);
      return [];
    }
  }

  /**
   * Extract keywords from text content
   */
  private extractKeywords(text: string): string[] {
    // Remove common Portuguese stop words
    const stopWords = new Set([
      'a', 'o', 'e', 'de', 'do', 'da', 'em', 'um', 'uma', 'com', 'não', 'se', 'na', 'por',
      'mais', 'as', 'dos', 'como', 'mas', 'foi', 'ao', 'ele', 'das', 'tem', 'à', 'seu',
      'sua', 'ou', 'ser', 'quando', 'muito', 'há', 'nos', 'já', 'está', 'eu', 'também',
      'só', 'pelo', 'pela', 'até', 'isso', 'ela', 'entre', 'era', 'depois', 'sem', 'mesmo',
      'aos', 'ter', 'seus', 'suas', 'numa', 'pelos', 'pelas', 'esse', 'essa', 'num', 'nem',
      'suas', 'meu', 'às', 'minha', 'têm', 'numa', 'pelos', 'pelas', 'sido', 'the', 'and',
      'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our',
      'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old',
      'see', 'two', 'who', 'boy', 'did', 'man', 'way', 'she', 'many', 'some', 'time', 'very',
      'when', 'come', 'here', 'just', 'like', 'long', 'make', 'over', 'such', 'take', 'than',
      'them', 'well', 'were', 'will', 'with', 'have', 'this', 'that', 'from', 'they', 'know',
      'want', 'been', 'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just'
    ]);

    const words = text
      .replace(/[^\w\sÀ-ÿ]/g, ' ') // Keep accented characters
      .toLowerCase()
      .split(/\s+/)
      .filter(word => 
        word.length > 3 && 
        !stopWords.has(word) &&
        !/^\d+$/.test(word) // Remove pure numbers
      );

    // Count word frequency
    const wordCount: { [key: string]: number } = {};
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });

    // Return words sorted by frequency
    return Object.entries(wordCount)
      .sort(([,a], [,b]) => b - a)
      .map(([word]) => word);
  }

  /**
   * Increment tag usage count
   */
  private async incrementTagUsage(tagId: string): Promise<void> {
    try {
      await this.db
        .update(tags)
        .set({ 
          useCount: sql`${tags.useCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(tags.id, tagId));
    } catch (error) {
      console.error('Error incrementing tag usage:', error);
    }
  }

  /**
   * Normalize tag name
   */
  private normalizeTagName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^\w\sÀ-ÿ-]/g, '') // Keep accented characters and hyphens
      .replace(/\s+/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Generate slug from tag name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .trim()
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Remove multiple consecutive hyphens
      .substring(0, 50); // Limit length
  }

  /**
   * Update tag
   */
  async updateTag(id: string, data: Partial<TagData>): Promise<TagData | null> {
    try {
      // If name is being updated, generate new slug
      const updateData: any = {
        ...data,
        updatedAt: new Date(),
      };

      if (data.name) {
        updateData.slug = this.generateSlug(data.name);
      }

      const [updated] = await this.db
        .update(tags)
        .set(updateData)
        .where(eq(tags.id, id))
        .returning();

      return updated || null;
    } catch (error) {
      console.error('Error updating tag:', error);
      throw error;
    }
  }

  /**
   * Delete tag
   */
  async deleteTag(id: string): Promise<boolean> {
    try {
      // Remove all associations first
      await this.db
        .delete(articleTags)
        .where(eq(articleTags.tagId, id));

      // Delete tag
      const result = await this.db
        .delete(tags)
        .where(eq(tags.id, id));

      return true;
    } catch (error) {
      console.error('Error deleting tag:', error);
      return false;
    }
  }
}