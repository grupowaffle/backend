import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export class ValidationError extends Error implements AppError {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  details: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class NotFoundError extends Error implements AppError {
  statusCode = 404;
  code = 'NOT_FOUND';

  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends Error implements AppError {
  statusCode = 401;
  code = 'UNAUTHORIZED';

  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error implements AppError {
  statusCode = 403;
  code = 'FORBIDDEN';

  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends Error implements AppError {
  statusCode = 409;
  code = 'CONFLICT';

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class InternalServerError extends Error implements AppError {
  statusCode = 500;
  code = 'INTERNAL_SERVER_ERROR';

  constructor(message = 'Internal server error') {
    super(message);
    this.name = 'InternalServerError';
  }
}

export const errorHandler = async (c: Context, next: Next) => {
  try {
    await next();
  } catch (err) {
    console.error('Error caught by error handler:', err);

    // Handle HTTPException from Hono
    if (err instanceof HTTPException) {
      return c.json({
        success: false,
        error: {
          message: err.message,
          code: 'HTTP_EXCEPTION',
        },
      }, err.status);
    }

    // Handle Zod validation errors
    if (err instanceof ZodError) {
      const errors = err.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message,
      }));

      return c.json({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors,
        },
      }, 400);
    }

    // Handle custom AppErrors
    if (err instanceof Error && 'statusCode' in err) {
      const appError = err as AppError;
      return c.json({
        success: false,
        error: {
          message: appError.message,
          code: appError.code || 'ERROR',
          details: appError.details,
        },
      }, appError.statusCode || 500);
    }

    // Handle generic errors
    if (err instanceof Error) {
      // Don't expose internal error messages in production
      const isProduction = c.env?.NODE_ENV === 'production';
      const message = isProduction ? 'Internal server error' : err.message;

      return c.json({
        success: false,
        error: {
          message,
          code: 'INTERNAL_ERROR',
        },
      }, 500);
    }

    // Fallback for unknown errors
    return c.json({
      success: false,
      error: {
        message: 'An unexpected error occurred',
        code: 'UNKNOWN_ERROR',
      },
    }, 500);
  }
};

/**
 * Async error wrapper for route handlers
 */
export const asyncHandler = (fn: Function) => {
  return async (c: Context, next?: Next) => {
    try {
      return await fn(c, next);
    } catch (error) {
      throw error; // Will be caught by errorHandler middleware
    }
  };
};