import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { CategoryRepository } from '../../repositories';
import { NewCategory } from '../../config/db/schema';
import { generateId } from '../../lib/cuid';

// Validation schemas
const createCategorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required').optional(),
  description: z.string().optional(),
  parentId: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  order: z.number().default(0),
  isActive: z.boolean().default(true),
  featuredOnHomepage: z.boolean().default(false),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
});

const updateCategorySchema = createCategorySchema.partial();

const listCategoriesSchema = z.object({
  page: z.string().transform(val => parseInt(val) || 1).default('1'),
  limit: z.string().transform(val => Math.min(100, parseInt(val) || 20)).default('20'),
  sortBy: z.string().default('order'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export class CategoryController {
  private app: Hono;
  private categoryRepository: CategoryRepository;

  constructor(categoryRepository: CategoryRepository) {
    this.app = new Hono();
    this.categoryRepository = categoryRepository;
    this.setupRoutes();
  }

  private setupRoutes() {
    // Create category
    this.app.post('/', zValidator('json', createCategorySchema), async (c) => {
      try {
        const data = c.req.valid('json');
        
        // Generate slug if not provided
        if (!data.slug) {
          data.slug = this.generateSlug(data.name);
        }

        const categoryData: NewCategory = {
          ...data,
          id: generateId(),
        };

        const category = await this.categoryRepository.create(categoryData);

        return c.json({
          success: true,
          data: category,
        }, 201);
      } catch (error) {
        // Error creating category
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create category',
        }, 400);
      }
    });

    // Get category statistics (must be before /:id route)
    this.app.get('/stats', async (c) => {
      try {
        const stats = await this.categoryRepository.getStats();

        return c.json({
          success: true,
          data: stats,
        });
      } catch (error) {
        // Error fetching category stats
        return c.json({
          success: false,
          error: 'Failed to fetch category statistics',
        }, 500);
      }
    });

    // Get category hierarchy (must be before /:id route)
    this.app.get('/hierarchy', async (c) => {
      try {
        const hierarchy = await this.categoryRepository.getCategoryHierarchy();

        return c.json({
          success: true,
          data: hierarchy,
        });
      } catch (error) {
        // Error fetching category hierarchy
        return c.json({
          success: false,
          error: 'Failed to fetch category hierarchy',
        }, 500);
      }
    });

    // Get category by ID
    this.app.get('/:id', async (c) => {
      try {
        const id = c.req.param('id');

        const category = await this.categoryRepository.findById(id);

        if (!category) {
          return c.json({
            success: false,
            error: 'Category not found',
          }, 404);
        }

        return c.json({
          success: true,
          data: category,
        });
      } catch (error) {
        // Error fetching category
        return c.json({
          success: false,
          error: 'Failed to fetch category',
        }, 500);
      }
    });

    // Update category
    this.app.put('/:id', zValidator('json', updateCategorySchema), async (c) => {
      try {
        const id = c.req.param('id');
        const data = c.req.valid('json');

        const category = await this.categoryRepository.update(id, data);

        if (!category) {
          return c.json({
            success: false,
            error: 'Category not found',
          }, 404);
        }

        return c.json({
          success: true,
          data: category,
        });
      } catch (error) {
        // Error updating category
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update category',
        }, 400);
      }
    });

    // Delete category
    this.app.delete('/:id', async (c) => {
      try {
        const id = c.req.param('id');
        console.log('🗑️ [Backend] Recebida requisição para deletar categoria:', id);

        const success = await this.categoryRepository.delete(id);
        console.log('🗑️ [Backend] Resultado da exclusão:', success);

        if (!success) {
          console.log('❌ [Backend] Categoria não encontrada:', id);
          return c.json({
            success: false,
            error: 'Category not found',
          }, 404);
        }

        console.log('✅ [Backend] Categoria excluída com sucesso:', id);
        return c.json({
          success: true,
          message: 'Category deleted successfully',
        });
      } catch (error) {
        console.error('❌ [Backend] Erro ao deletar categoria:', error);
        // Error deleting category
        return c.json({
          success: false,
          error: 'Failed to delete category',
        }, 500);
      }
    });

    // List categories
    this.app.get('/', zValidator('query', listCategoriesSchema), async (c) => {
      try {
        const params = c.req.valid('query');

        const categories = await this.categoryRepository.listWithArticleCount({
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
        });

        // Categories with article count

        return c.json({
          success: true,
          data: categories,
        });
      } catch (error) {
        // Error listing categories
        return c.json({
          success: false,
          error: 'Failed to list categories',
        }, 500);
      }
    });

    // Get parent categories
    this.app.get('/parents', async (c) => {
      try {
        const categories = await this.categoryRepository.listParentCategories();

        return c.json({
          success: true,
          data: categories,
        });
      } catch (error) {
        // Error fetching parent categories
        return c.json({
          success: false,
          error: 'Failed to fetch parent categories',
        }, 500);
      }
    });

    // Get subcategories
    this.app.get('/:id/subcategories', async (c) => {
      try {
        const parentId = c.req.param('id');

        const subcategories = await this.categoryRepository.listSubcategories(parentId);

        return c.json({
          success: true,
          data: subcategories,
        });
      } catch (error) {
        // Error fetching subcategories
        return c.json({
          success: false,
          error: 'Failed to fetch subcategories',
        }, 500);
      }
    });

    // Get featured categories
    this.app.get('/featured', async (c) => {
      try {
        const categories = await this.categoryRepository.listFeaturedCategories();

        return c.json({
          success: true,
          data: categories,
        });
      } catch (error) {
        // Error fetching featured categories
        return c.json({
          success: false,
          error: 'Failed to fetch featured categories',
        }, 500);
      }
    });


    // Get category by slug
    this.app.get('/slug/:slug', async (c) => {
      try {
        const slug = c.req.param('slug');

        const category = await this.categoryRepository.findBySlug(slug);

        if (!category) {
          return c.json({
            success: false,
            error: 'Category not found',
          }, 404);
        }

        return c.json({
          success: true,
          data: category,
        });
      } catch (error) {
        // Error fetching category by slug
        return c.json({
          success: false,
          error: 'Failed to fetch category',
        }, 500);
      }
    });

  }

  /**
   * Generate slug from name
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
   * Get the Hono app
   */
  getApp() {
    return this.app;
  }
}