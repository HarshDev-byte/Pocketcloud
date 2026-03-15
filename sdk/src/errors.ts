/**
 * Typed error classes for Pocket Cloud Drive SDK
 */

export class PocketCloudError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: any;

  constructor(message: string, code: string, statusCode: number = 0, details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Authentication failed - invalid credentials or expired session
 */
export class AuthenticationError extends PocketCloudError {
  constructor(message: string = 'Authentication failed', details?: any) {
    super(message, 'AUTHENTICATION_ERROR', 401, details);
  }
}

/**
 * Access denied - insufficient permissions
 */
export class AuthorizationError extends PocketCloudError {
  constructor(message: string = 'Access denied', details?: any) {
    super(message, 'AUTHORIZATION_ERROR', 403, details);
  }
}

/**
 * Resource not found
 */
export class NotFoundError extends PocketCloudError {
  constructor(message: string = 'Resource not found', details?: any) {
    super(message, 'NOT_FOUND', 404, details);
  }
}

/**
 * Storage quota exceeded
 */
export class QuotaExceededError extends PocketCloudError {
  public readonly used: number;
  public readonly quota: number;

  constructor(message: string, used: number, quota: number, details?: any) {
    super(message, 'QUOTA_EXCEEDED', 413, details);
    this.used = used;
    this.quota = quota;
  }
}

/**
 * Rate limit exceeded
 */
export class RateLimitError extends PocketCloudError {
  public readonly retryAfter: number;

  constructor(message: string, retryAfter: number, details?: any) {
    super(message, 'RATE_LIMITED', 429, details);
    this.retryAfter = retryAfter;
  }
}

/**
 * Network or connection error
 */
export class NetworkError extends PocketCloudError {
  constructor(message: string = 'Network error', details?: any) {
    super(message, 'NETWORK_ERROR', 0, details);
  }
}

/**
 * Server error (5xx responses)
 */
export class ServerError extends PocketCloudError {
  constructor(message: string = 'Server error', statusCode: number = 500, details?: any) {
    super(message, 'SERVER_ERROR', statusCode, details);
  }
}

/**
 * Validation error - invalid input data
 */
export class ValidationError extends PocketCloudError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

/**
 * Conflict error - resource already exists or conflicting operation
 */
export class ConflictError extends PocketCloudError {
  constructor(message: string = 'Conflict', details?: any) {
    super(message, 'CONFLICT', 409, details);
  }
}

/**
 * Timeout error - request took too long
 */
export class TimeoutError extends PocketCloudError {
  constructor(message: string = 'Request timeout', details?: any) {
    super(message, 'TIMEOUT', 408, details);
  }
}

/**
 * Insufficient storage space on device
 */
export class StorageFullError extends PocketCloudError {
  constructor(message: string = 'Storage full', details?: any) {
    super(message, 'STORAGE_FULL', 507, details);
  }
}

/**
 * Upload was cancelled
 */
export class UploadCancelledError extends PocketCloudError {
  constructor(message: string = 'Upload cancelled', details?: any) {
    super(message, 'UPLOAD_CANCELLED', 0, details);
  }
}

/**
 * Create appropriate error from API response
 */
export function createErrorFromResponse(response: any, statusCode: number): PocketCloudError {
  const errorData = response?.error || {};
  const message = errorData.message || `HTTP ${statusCode}`;
  const code = errorData.code || 'UNKNOWN_ERROR';
  const details = errorData.details;

  switch (statusCode) {
    case 400:
      return new ValidationError(message, details);
    case 401:
      return new AuthenticationError(message, details);
    case 403:
      return new AuthorizationError(message, details);
    case 404:
      return new NotFoundError(message, details);
    case 408:
      return new TimeoutError(message, details);
    case 409:
      return new ConflictError(message, details);
    case 413:
      if (code === 'QUOTA_EXCEEDED' && details?.used !== undefined && details?.quota !== undefined) {
        return new QuotaExceededError(message, details.used, details.quota, details);
      }
      return new ValidationError(message, details);
    case 429:
      const retryAfter = details?.retryAfter || 60;
      return new RateLimitError(message, retryAfter, details);
    case 507:
      return new StorageFullError(message, details);
    default:
      if (statusCode >= 500) {
        return new ServerError(message, statusCode, details);
      }
      return new PocketCloudError(message, code, statusCode, details);
  }
}

/**
 * Create network error from fetch failure
 */
export function createNetworkError(error: any): NetworkError {
  if (error.name === 'AbortError') {
    return new TimeoutError('Request timeout');
  }
  
  const message = error.message || 'Network error';
  return new NetworkError(message, { originalError: error });
}

/**
 * Type guard to check if error is a PocketCloudError
 */
export function isPocketCloudError(error: any): error is PocketCloudError {
  return error instanceof PocketCloudError;
}

/**
 * Type guard to check if error is a specific PocketCloud error type
 */
export function isAuthenticationError(error: any): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

export function isAuthorizationError(error: any): error is AuthorizationError {
  return error instanceof AuthorizationError;
}

export function isNotFoundError(error: any): error is NotFoundError {
  return error instanceof NotFoundError;
}

export function isQuotaExceededError(error: any): error is QuotaExceededError {
  return error instanceof QuotaExceededError;
}

export function isRateLimitError(error: any): error is RateLimitError {
  return error instanceof RateLimitError;
}

export function isNetworkError(error: any): error is NetworkError {
  return error instanceof NetworkError;
}

export function isServerError(error: any): error is ServerError {
  return error instanceof ServerError;
}

export function isValidationError(error: any): error is ValidationError {
  return error instanceof ValidationError;
}

export function isConflictError(error: any): error is ConflictError {
  return error instanceof ConflictError;
}

export function isTimeoutError(error: any): error is TimeoutError {
  return error instanceof TimeoutError;
}

export function isStorageFullError(error: any): error is StorageFullError {
  return error instanceof StorageFullError;
}

export function isUploadCancelledError(error: any): error is UploadCancelledError {
  return error instanceof UploadCancelledError;
}