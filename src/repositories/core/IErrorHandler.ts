// Interface for error handling (Dependency Inversion Principle)
export interface IErrorHandler {
  handle(error: any, operation: string): never;
}

export class DatabaseErrorHandler implements IErrorHandler {
  handle(error: any, operation: string): never {
    console.error(`Database error during ${operation}:`, error);
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      hint: error?.hint,
      stack: error?.stack
    });

    // Specific error codes
    if (error.code === '23505') {
      throw new Error('Record already exists');
    }
    if (error.code === '23503') {
      throw new Error('Referenced record does not exist');
    }
    if (error.code === '23514') {
      throw new Error('Check constraint violation');
    }

    // Generic error message
    if (error?.message) {
      throw new Error(`Database operation failed: ${operation} - ${error.message}`);
    }

    throw new Error(`Database operation failed: ${operation}`);
  }
}