import { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

interface ErrorResponse {
  error: string;
  code: string;
  timestamp: string;
  path: string;
}

export class ErrorHandler {
  static handle(err: AppError, req: Request, res: Response, next: NextFunction): void {
    // Log full error details to journald/console
    const errorDetails = {
      message: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
      userId: req.user?.id || 'anonymous'
    };

    console.error('Application Error:', JSON.stringify(errorDetails, null, 2));

    // Determine error type and response
    const errorResponse = ErrorHandler.buildErrorResponse(err, req);
    
    res.status(errorResponse.statusCode).json({
      error: errorResponse.message,
      code: errorResponse.code,
      timestamp: errorResponse.timestamp,
      path: req.path
    });
  }

  private static buildErrorResponse(err: AppError, req: Request): {
    statusCode: number;
    message: string;
    code: string;
    timestamp: string;
  } {
    const timestamp = new Date().toISOString();

    // Handle Multer errors (file upload)
    if (err instanceof MulterError) {
      switch (err.code) {
        case 'LIMIT_FILE_SIZE':
          return {
            statusCode: 413,
            message: 'File too large',
            code: 'FILE_TOO_LARGE',
            timestamp
          };
        case 'LIMIT_FILE_COUNT':
          return {
            statusCode: 400,
            message: 'Too many files',
            code: 'TOO_MANY_FILES',
            timestamp
          };
        case 'LIMIT_UNEXPECTED_FILE':
          return {
            statusCode: 400,
            message: 'Unexpected file field',
            code: 'UNEXPECTED_FILE',
            timestamp
          };
        default:
          return {
            statusCode: 400,
            message: 'File upload error',
            code: 'UPLOAD_ERROR',
            timestamp
          };
      }
    }

    // Handle SQLite errors
    if (err.message.includes('SQLITE_')) {
      if (err.message.includes('SQLITE_CONSTRAINT')) {
        return {
          statusCode: 409,
          message: 'Data constraint violation',
          code: 'CONSTRAINT_ERROR',
          timestamp
        };
      }
      if (err.message.includes('SQLITE_BUSY')) {
        return {
          statusCode: 503,
          message: 'Database temporarily unavailable',
          code: 'DATABASE_BUSY',
          timestamp
        };
      }
      if (err.message.includes('SQLITE_CORRUPT')) {
        return {
          statusCode: 500,
          message: 'Database corruption detected',
          code: 'DATABASE_CORRUPT',
          timestamp
        };
      }
      return {
        statusCode: 500,
        message: 'Database error',
        code: 'DATABASE_ERROR',
        timestamp
      };
    }

    // Handle filesystem errors
    if (err.code === 'ENOSPC') {
      return {
        statusCode: 507,
        message: 'Insufficient storage space',
        code: 'DISK_FULL',
        timestamp
      };
    }

    if (err.code === 'ENOENT') {
      return {
        statusCode: 404,
        message: 'File not found',
        code: 'FILE_NOT_FOUND',
        timestamp
      };
    }

    if (err.code === 'EACCES' || err.code === 'EPERM') {
      return {
        statusCode: 403,
        message: 'Permission denied',
        code: 'PERMISSION_DENIED',
        timestamp
      };
    }

    if (err.code === 'EMFILE' || err.code === 'ENFILE') {
      return {
        statusCode: 503,
        message: 'Too many open files',
        code: 'TOO_MANY_FILES_OPEN',
        timestamp
      };
    }

    // Handle validation errors
    if (err.message.includes('validation') || err.message.includes('invalid')) {
      return {
        statusCode: 400,
        message: 'Invalid request data',
        code: 'VALIDATION_ERROR',
        timestamp
      };
    }

    // Handle authentication/authorization errors
    if (err.message.includes('unauthorized') || err.message.includes('authentication')) {
      return {
        statusCode: 401,
        message: 'Authentication required',
        code: 'UNAUTHORIZED',
        timestamp
      };
    }

    if (err.message.includes('forbidden') || err.message.includes('access denied')) {
      return {
        statusCode: 403,
        message: 'Access forbidden',
        code: 'FORBIDDEN',
        timestamp
      };
    }

    // Handle rate limiting
    if (err.message.includes('rate limit') || err.message.includes('too many requests')) {
      return {
        statusCode: 429,
        message: 'Too many requests',
        code: 'RATE_LIMITED',
        timestamp
      };
    }

    // Handle timeout errors
    if (err.message.includes('timeout') || err.code === 'ETIMEDOUT') {
      return {
        statusCode: 408,
        message: 'Request timeout',
        code: 'TIMEOUT',
        timestamp
      };
    }

    // Handle JSON parsing errors
    if (err instanceof SyntaxError && 'body' in err) {
      return {
        statusCode: 400,
        message: 'Invalid JSON format',
        code: 'INVALID_JSON',
        timestamp
      };
    }

    // Handle custom application errors
    if (err.statusCode && err.isOperational) {
      return {
        statusCode: err.statusCode,
        message: err.message,
        code: err.code || 'APPLICATION_ERROR',
        timestamp
      };
    }

    // Default server error - never expose internal details
    return {
      statusCode: 500,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      timestamp
    };
  }

  // Handle async errors
  static asyncHandler(fn: Function) {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  // Create custom application error
  static createError(message: string, statusCode: number = 500, code?: string): AppError {
    const error = new Error(message) as AppError;
    error.statusCode = statusCode;
    error.code = code;
    error.isOperational = true;
    return error;
  }
}

// 404 handler for unmatched routes
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = ErrorHandler.createError(
    `Route ${req.method} ${req.path} not found`,
    404,
    'ROUTE_NOT_FOUND'
  );
  next(error);
};

// Main error handling middleware
export const errorHandler = ErrorHandler.handle;

// Async wrapper for route handlers
export const asyncHandler = ErrorHandler.asyncHandler;