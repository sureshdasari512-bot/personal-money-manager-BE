import type { Request } from 'express';
import { AppError, type AuthTokenPayload } from '../types/index.js';

/**
 * Narrows `req.user` after `authenticate` has run.
 *
 * @param req - Authenticated request
 * @returns The verified token payload
 * @throws {AppError} If authenticate was not applied to this route
 */
export function requireUser(req: Request): AuthTokenPayload {
  if (!req.user) {
    throw new AppError('Unauthenticated', 401);
  }
  return req.user;
}
