import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError, type AuthTokenPayload } from '../types/index.js';

/**
 * Reads and verifies the JWT from the httpOnly cookie, attaching the user to `req`.
 *
 * @param req - Incoming request expected to carry `accessToken`
 * @param _res - Unused; errors go through the global error middleware
 * @param next - Continues the chain when the token is valid
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.accessToken as string | undefined;
  if (!token) {
    next(new AppError('No token provided', 401));
    return;
  }

  try {
    req.user = jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401));
  }
}
