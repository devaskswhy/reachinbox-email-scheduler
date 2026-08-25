/**
 * An error whose status code and message are safe to send to the client.
 * Anything thrown that is *not* an ApiError is treated as a bug and reported
 * as a generic 500, so internals never leak through the error handler.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly details: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, message, details);
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, message);
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, message, details);
  }

  static unavailable(message: string, details?: unknown): ApiError {
    return new ApiError(503, message, details);
  }
}
