import type { PublicUser, User } from '../types/index.js';

/**
 * Strips the password hash before returning a user to API callers.
 *
 * @param user - Full user record
 * @returns Public user fields
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt,
    createdBy: user.createdBy,
    updatedBy: user.updatedBy,
    deletedBy: user.deletedBy,
  };
}
