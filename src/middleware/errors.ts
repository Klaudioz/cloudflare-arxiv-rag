/**
 * Error handling middleware
 */

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class AISearchError extends AppError {
  constructor(message: string) {
    super(message, 503, 'AI_SEARCH_ERROR');
    this.name = 'AISearchError';
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super('Rate limit exceeded', 429, 'RATE_LIMIT');
    this.retryAfter = retryAfter;
    this.name = 'RateLimitError';
  }

  retryAfter?: number;
}

export function isAppError(error: any): error is AppError {
  return error instanceof AppError;
}

export function formatError(error: any) {
  if (isAppError(error)) {
    return {
      success: false,
      error: {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode
      }
    };
  }

  return {
    success: false,
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      statusCode: 500
    }
  };
}
