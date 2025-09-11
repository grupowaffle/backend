import { Context, Next } from 'hono';
import { z, ZodSchema } from 'zod';

/**
 * Middleware de validação para Hono usando Zod
 * Valida dados de entrada e retorna erros estruturados
 */

export interface ValidationOptions {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Middleware de validação genérico
 * @param schemas - Schemas para validar body, query e params
 * @returns Middleware function
 */
export function validationMiddleware(schemas: ValidationOptions) {
  return async (c: Context, next: Next) => {
    try {
      // Validar body se schema fornecido
      if (schemas.body) {
        const body = await c.req.json().catch(() => ({}));
        const validatedBody = schemas.body.parse(body);
        c.set('validatedBody', validatedBody);
      }

      // Validar query params se schema fornecido
      if (schemas.query) {
        const query = c.req.query();
        const validatedQuery = schemas.query.parse(query);
        c.set('validatedQuery', validatedQuery);
      }

      // Validar route params se schema fornecido
      if (schemas.params) {
        const params = c.req.param();
        const validatedParams = schemas.params.parse(params);
        c.set('validatedParams', validatedParams);
      }

      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Retornar erros de validação estruturados
        const validationErrors = error.issues.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        return c.json({
          status: 'error',
          message: 'Dados de entrada inválidos',
          errors: validationErrors,
          timestamp: new Date().toISOString(),
        }, 400);
      }

      // Re-throw outros erros
      throw error;
    }
  };
}

/**
 * Helper para validar apenas body
 * @param schema - Schema Zod para o body
 * @returns Middleware function
 */
export function validateBody(schema: ZodSchema) {
  return validationMiddleware({ body: schema });
}

/**
 * Helper para validar apenas query params
 * @param schema - Schema Zod para query params
 * @returns Middleware function
 */
export function validateQuery(schema: ZodSchema) {
  return validationMiddleware({ query: schema });
}

/**
 * Helper para validar apenas route params
 * @param schema - Schema Zod para route params
 * @returns Middleware function
 */
export function validateParams(schema: ZodSchema) {
  return validationMiddleware({ params: schema });
}

/**
 * Helper para obter dados validados do contexto
 * @param c - Context do Hono
 * @returns Objeto com dados validados
 */
export function getValidatedData(c: Context) {
  return {
    body: c.get('validatedBody'),
    query: c.get('validatedQuery'),
    params: c.get('validatedParams'),
  };
}
