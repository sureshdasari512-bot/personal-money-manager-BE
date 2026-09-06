import type { NextFunction, Request, Response } from 'express';
import { AppError, type ApiErrorBody } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Builds the single client error envelope used by every failed response.
 *
 * @param message - Global message shown at the top of a form or as a toast
 * @param fields - Field errors, or null when the error is global-only
 * @returns Consistent error JSON
 */
export function toApiErrorBody(message: string, fields: ApiErrorBody['fields'] = null): ApiErrorBody {
  return { message, fields };
}

/**
 * Centralized Express error-handling middleware.
 * Catches errors thrown or passed via `next(err)` from any controller.
 *
 * Global pattern: `{ message, fields: null }`
 * Field pattern: `{ message, fields: { email: "...", password: "..." } }`
 *
 * @param err - Error thrown by a downstream handler
 * @param req - Incoming request (used for path in logs)
 * @param res - Response used to send a safe JSON error body
 * @param _next - Unused; required by Express error-middleware signature
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const { statusCode, message, fields } = resolveClientError(err);

  if (statusCode >= 500) {
    logger.error({ err, path: req.path }, 'Request failed');
  } else {
    logger.warn({ err, path: req.path, statusCode }, 'Request rejected');
  }

  res.status(statusCode).json(toApiErrorBody(message, fields));
}

/**
 * Maps thrown errors onto the two client error patterns without leaking internals.
 *
 * @param err - Error from Express or application code
 * @returns Status, global message, and optional field map
 */
function resolveClientError(err: Error): {
  statusCode: number;
  message: string;
  fields: ApiErrorBody['fields'];
} {
  if (err instanceof AppError) {
    return { statusCode: err.statusCode, message: err.message, fields: err.fields };
  }

  if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
    return { statusCode: 400, message: 'Invalid JSON body', fields: null };
  }

  return { statusCode: 500, message: 'Internal server error', fields: null };
}
