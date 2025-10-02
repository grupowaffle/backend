import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { TagService } from '../../services/TagService';
import { getDrizzleClient } from '../../config/db';
import { Env } from '../../config/types/common';

// Validation schemas
const createTagSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
  slug: z.string().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  isActive: z.boolean().optional(),
});

const updateTagSchema = createTagSchema.partial();

const searchTagsSchema = z.object({
  q: z.string().min(2, 'Query must be at least 2 characters'),
  limit: z.string().transform(val => Math.min(50, parseInt(val) || 10)).default(10),
});

const suggestTagsSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
  categoryId: z.string().optional(),
});

const associateTagsSchema = z.object({
  articleId: z.string().min(1, 'Article ID is required'),
  tags: z.array(z.string().min(1)).max(20, 'Maximum 20 tags allowed'),
});

export class TagController {
  private app: Hono;
  private tagService: TagService;

  constructor(env: Env) {
    this.app = new Hono();
    const db = getDrizzleClient(env);
    this.tagService = new TagService(db);
    this.setupRoutes();
  }

  private setupRoutes() {
    // Search tags (autocomplete)
    this.app.get('/search', zValidator('query', searchTagsSchema), async (c) => {
      try {
        const { q: query, limit } = c.req.valid('query');

        console.log(`🔍 Searching tags: "${query}"`);

        const results = await this.tagService.searchTags(query, limit);

        return c.json({
          success: true,
          data: results,
        });
      } catch (error) {
        console.error('Error searching tags:', error);
        return c.json({
          success: false,
          error: 'Failed to search tags',
        }, 500);
      }
    });

    // Get popular tags
    this.app.get('/popular', async (c) => {
      try {
        const limit = parseInt(c.req.query('limit') || '20');

        console.log(`📈 Getting ${limit} popular tags`);

        const tags = await this.tagService.getPopularTags(limit);

        return c.json({
          success: true,
          data: tags,
        });
      } catch (error) {
        console.error('Error getting popular tags:', error);
        return c.json({
          success: false,
          error: 'Failed to get popular tags',
        }, 500);
      }
    });

    // Get tag statistics (must be before /:id route)
    this.app.get('/stats', async (c) => {
      try {
        console.log('📊 Getting tag statistics');

        const allTags = await this.tagService.getAllTags();
        const popularTags = await this.tagService.getPopularTags(10);

        const stats = {
          totalTags: allTags.length,
          activeTags: allTags.filter(t => t.isActive).length,
          totalUsage: allTags.reduce((sum, tag) => sum + tag.useCount, 0),
          popularTags: popularTags.map(tag => ({
            name: tag.name,
            useCount: tag.useCount,
          })),
          averageUsage: allTags.length > 0 
            ? allTags.reduce((sum, tag) => sum + tag.useCount, 0) / allTags.length 
            : 0,
          unusedTags: allTags.filter(t => t.useCount === 0).length,
        };

        return c.json({
          success: true,
          data: stats,
        });
      } catch (error) {
        console.error('Error getting tag stats:', error);
        return c.json({
          success: false,
          error: 'Failed to get tag statistics',
        }, 500);
      }
    });

    // Get all tags with pagination
    this.app.get('/', async (c) => {
      try {
        const page = parseInt(c.req.query('page') || '1');
        const limit = Math.min(50, parseInt(c.req.query('limit') || '10'));
        const sortBy = c.req.query('sortBy') as 'name' | 'useCount' | 'createdAt' || 'name';
        const sortOrder = c.req.query('sortOrder') as 'asc' | 'desc' || 'asc';
        const search = c.req.query('search');
        const isActive = c.req.query('isActive');


        const filters = {
          search,
          isActive: isActive ? isActive === 'true' : undefined,
        };

        // Usar o TagRepository diretamente para obter dados com paginação
        const { TagRepository } = await import('../../repositories/TagRepository');
        const tagRepository = new TagRepository(this.tagService['db']);
        
        const result = await tagRepository.list({
          page,
          limit,
          sortBy,
          sortOrder,
          filters,
        });


        return c.json({
          success: true,
          data: result.data,
          pagination: result.pagination,
        });
      } catch (error) {
        console.error('Error getting tags:', error);
        return c.json({
          success: false,
          error: 'Failed to get tags',
        }, 500);
      }
    });

    // Get tag by ID
    this.app.get('/:id', async (c) => {
      try {
        const id = c.req.param('id');

        if (!id) {
          return c.json({
            success: false,
            error: 'Tag ID is required',
          }, 400);
        }

        console.log(`🔍 Getting tag: ${id}`);

        const tag = await this.tagService.getTagById(id);

        if (!tag) {
          return c.json({
            success: false,
            error: 'Tag not found',
          }, 404);
        }

        return c.json({
          success: true,
          data: tag,
        });
      } catch (error) {
        console.error('Error getting tag:', error);
        return c.json({
          success: false,
          error: 'Failed to get tag',
        }, 500);
      }
    });

    // Suggest tags based on content
    this.app.post('/suggest', zValidator('json', suggestTagsSchema), async (c) => {
      try {
        const { title, content, categoryId } = c.req.valid('json');

        console.log(`🤖 Suggesting tags for: "${title.substring(0, 50)}..."`);

        const suggestions = await this.tagService.suggestTags(title, content, categoryId);

        return c.json({
          success: true,
          data: {
            suggestions,
            count: suggestions.length,
          },
        });
      } catch (error) {
        console.error('Error suggesting tags:', error);
        return c.json({
          success: false,
          error: 'Failed to suggest tags',
        }, 500);
      }
    });

    // Associate tags with article
    this.app.post('/associate', zValidator('json', associateTagsSchema), async (c) => {
      try {
        const { articleId, tags } = c.req.valid('json');

        console.log(`🏷️ Associating ${tags.length} tags with article: ${articleId}`);

        await this.tagService.associateTagsWithArticle(articleId, tags);

        // Get the associated tags to return
        const associatedTags = await this.tagService.getTagsForArticle(articleId);

        return c.json({
          success: true,
          message: `Successfully associated ${associatedTags.length} tags`,
          data: associatedTags,
        });
      } catch (error) {
        console.error('Error associating tags:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to associate tags',
        }, 500);
      }
    });

    // Get tags for specific article
    this.app.get('/article/:articleId', async (c) => {
      try {
        const articleId = c.req.param('articleId');

        console.log(`🔍 Getting tags for article: ${articleId}`);

        const tags = await this.tagService.getTagsForArticle(articleId);

        return c.json({
          success: true,
          data: tags,
        });
      } catch (error) {
        console.error('Error getting article tags:', error);
        return c.json({
          success: false,
          error: 'Failed to get article tags',
        }, 500);
      }
    });

    // Create tag manually
    this.app.post('/', zValidator('json', createTagSchema), async (c) => {
      try {
        const { name, description, color } = c.req.valid('json');

        console.log(`➕ Creating new tag: "${name}"`);

        const tag = await this.tagService.createOrGetTag(name);

        // Update with additional info if it's a new tag
        if (description || color) {
          const updatedTag = await this.tagService.updateTag(tag.id, {
            description,
            color,
          });

          return c.json({
            success: true,
            data: updatedTag,
          }, 201);
        }

        return c.json({
          success: true,
          data: tag,
        }, tag.useCount === 0 ? 201 : 200); // 201 if new, 200 if existing
      } catch (error) {
        console.error('Error creating tag:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create tag',
        }, 500);
      }
    });

    // Update tag
    this.app.put('/:id', zValidator('json', updateTagSchema), async (c) => {
      try {
        const id = c.req.param('id');
        const data = c.req.valid('json');

        console.log(`✏️ Updating tag: ${id}`);

        const tag = await this.tagService.updateTag(id, data);

        if (!tag) {
          return c.json({
            success: false,
            error: 'Tag not found',
          }, 404);
        }

        return c.json({
          success: true,
          data: tag,
        });
      } catch (error) {
        console.error('Error updating tag:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update tag',
        }, 500);
      }
    });

    // Delete tag
    this.app.delete('/:id', async (c) => {
      try {
        const id = c.req.param('id');

        console.log(`🗑️ Deleting tag: ${id}`);

        const success = await this.tagService.deleteTag(id);

        if (!success) {
          return c.json({
            success: false,
            error: 'Tag not found or could not be deleted',
          }, 404);
        }

        return c.json({
          success: true,
          message: 'Tag deleted successfully',
        });
      } catch (error) {
        console.error('Error deleting tag:', error);
        return c.json({
          success: false,
          error: 'Failed to delete tag',
        }, 500);
      }
    });


    // Bulk operations
    this.app.post('/bulk/merge', zValidator('json', z.object({
      sourceTagIds: z.array(z.string()).min(1),
      targetTagId: z.string().min(1),
    })), async (c) => {
      try {
        const { sourceTagIds, targetTagId } = c.req.valid('json');

        console.log(`🔀 Merging ${sourceTagIds.length} tags into ${targetTagId}`);

        // This would require implementing merge logic in TagService
        // For now, return not implemented
        return c.json({
          success: false,
          error: 'Bulk merge not implemented yet',
        }, 501);
      } catch (error) {
        console.error('Error merging tags:', error);
        return c.json({
          success: false,
          error: 'Failed to merge tags',
        }, 500);
      }
    });
  }

  /**
   * Get the Hono app
   */
  getApp() {
    return this.app;
  }
}