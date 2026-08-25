import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { ApiError } from '../lib/errors.js';

/** The single response shape every failure is reported in. */
export interface ErrorResponseBody {
  error: string;
  details?: unknown;
}

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ErrorResponseBody = {
    error: `Route not found: ${req.method} ${req.path}`,
  };
  res.status(404).json(body);
};

interface ExposableHttpError extends Error {
  status: number;
  expose: true;
}

/**
 * http-errors marks client-caused failures with expose=true, meaning the
 * message is safe to return. Server-side ones (expose=false) fall through to
 * the generic 500 so nothing internal is disclosed.
 */
function isExposableHttpError(err: unknown): err is ExposableHttpError {
  if (!(err instanceof Error)) return false;
  const candidate = err as Partial<ExposableHttpError>;
  return (
    candidate.expose === true &&
    typeof candidate.status === 'number' &&
    candidate.status >= 400 &&
    candidate.status < 500
  );
}

function translate(err: unknown): { status: number; body: ErrorResponseBody } {
  if (err instanceof ZodError) {
    return {
      status: 400,
      body: { error: 'Validation failed', details: err.flatten() },
    };
  }

  if (err instanceof ApiError) {
    return {
      status: err.statusCode,
      body:
        err.details === undefined
          ? { error: err.message }
          : { error: err.message, details: err.details },
    };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return {
          status: 409,
          body: { error: 'A record with these values already exists' },
        };
      case 'P2003':
        return { status: 400, body: { error: 'Referenced record does not exist' } };
      case 'P2025':
        return { status: 404, body: { error: 'Record not found' } };
      default:
        return { status: 400, body: { error: `Database error (${err.code})` } };
    }
  }

  // body-parser (express.json) rejects malformed or oversized payloads with an
  // http-errors object: a 4xx status plus expose=true. Without this branch a
  // client sending broken JSON would be told it was a server fault.
  if (isExposableHttpError(err)) {
    return {
      status: err.status,
      body: {
        error: err.status === 413 ? 'Request body too large' : 'Malformed request body',
        details: { reason: err.message },
      },
    };
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return { status: 400, body: { error: 'Malformed database query' } };
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return { status: 503, body: { error: 'Database is unavailable' } };
  }

  // Anything else is an unhandled bug. Log it in full, but tell the client
  // nothing beyond a generic message so internals never leak.
  return { status: 500, body: { error: 'Internal server error' } };
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const { status, body } = translate(err);

  if (status >= 500) {
    console.error('[api] unhandled error:', err);
  }

  res.status(status).json(body);
};
