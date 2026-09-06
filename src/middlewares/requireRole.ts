import type { NextFunction, Request, Response } from 'express';
import { AppError, type UserRole } from '../types/index.js';

/**
 * Restricts a route to users with one of the given roles.
 * Authoritative RBAC check — frontend RoleGuard is UX only.
 *
 * @param allowedRoles - Roles permitted to access this route
 * @returns Express middleware that returns 403 when the role is insufficient
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const role = req.user?.role;
    if (!role || !allowedRoles.includes(role)) {
      next(new AppError('Forbidden: insufficient role', 403));
      return;
    }
    next();
  };
}
