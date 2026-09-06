import type { NextFunction, Request, Response } from 'express';

/**
 * CSRF verification hook for state-changing requests.
 * Pair with httpOnly cookies (XSS) — browsers auto-attach cookies, so CSRF
 * tokens are required on POST/PUT/PATCH/DELETE (see coding standards §3.5).
 *
 * Wire `csrf-csrf` here before production traffic. The scaffold keeps the
 * middleware slot in the chain so routes do not bypass this concern later.
 *
 * @param _req - Incoming request
 * @param _res - Response
 * @param next - Continues the chain
 */
export function verifyCsrf(_req: Request, _res: Response, next: NextFunction): void {
  next();
}
