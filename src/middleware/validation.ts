import { Context, Next } from 'hono';
import { z } from 'zod';

export interface ValidationOptions {
  allowUnknown?: boolean;
  stripUnknown?: boolean;
}

/**
 * Creates a validation middleware for request body
 */
export const validateBody = <T extends z.ZodTypeAny>(
  schema: T,
  options: ValidationOptions = {}
) => {
  return async (c: Context, next: Next) => {
    try {
      const body = await c.req.json();
      
      const validationOptions = {
        strict: !options.allowUnknown,
        ...options,
      };

      const validated = await schema.parseAsync(body);
      
      // Store validated data in context for use in handlers
      c.set('validatedBody', validated);
      
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({
          success: false,
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: error.errors.map(e => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
        }, 400);
      }
      
      throw error;
    }
  };
};

/**
 * Creates a validation middleware for query parameters
 */
export const validateQuery = <T extends z.ZodTypeAny>(
  schema: T,
  options: ValidationOptions = {}
) => {
  return async (c: Context, next: Next) => {
    try {
      const query = c.req.query();
      
      const validated = await schema.parseAsync(query);
      
      // Store validated data in context for use in handlers
      c.set('validatedQuery', validated);
      
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({
          success: false,
          error: {
            message: 'Query validation failed',
            code: 'VALIDATION_ERROR',
            details: error.errors.map(e => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
        }, 400);
      }
      
      throw error;
    }
  };
};

/**
 * Creates a validation middleware for route parameters
 */
export const validateParams = <T extends z.ZodTypeAny>(
  schema: T,
  options: ValidationOptions = {}
) => {
  return async (c: Context, next: Next) => {
    try {
      // Get all params from the context
      const params = c.req.param();
      
      const validated = await schema.parseAsync(params);
      
      // Store validated data in context for use in handlers
      c.set('validatedParams', validated);
      
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({
          success: false,
          error: {
            message: 'Parameter validation failed',
            code: 'VALIDATION_ERROR',
            details: error.errors.map(e => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
        }, 400);
      }
      
      throw error;
    }
  };
};

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // UUID validation
  uuid: z.string().uuid('Invalid ID format'),
  
  // CUID validation (if using CUIDs)
  cuid: z.string().regex(/^c[a-z0-9]{24}$/, 'Invalid ID format'),
  
  // Slug validation
  slug: z.string()
    .min(1, 'Slug is required')
    .max(100, 'Slug is too long')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug format'),
  
  // Email validation
  email: z.string().email('Invalid email format'),
  
  // Pagination
  pagination: z.object({
    page: z.string().transform(Number).pipe(z.number().min(1)).optional().default('1'),
    limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).optional().default('20'),
  }),
  
  // Sort options
  sort: z.object({
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  }),
  
  // Date range
  dateRange: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }),
  
  // Status enum for articles
  articleStatus: z.enum(['draft', 'published', 'scheduled', 'archived']),
  
  // User roles
  userRole: z.enum(['admin', 'editor-chefe', 'editor', 'revisor']),
};