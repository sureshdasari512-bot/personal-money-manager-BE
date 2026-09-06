import * as refreshTokenRepository from '../repositories/refreshTokenRepository.js';
import * as userRepository from '../repositories/userRepository.js';
import {
  AppError,
  type CreateUserInput,
  type PublicUser,
  type UpdateUserInput,
} from '../types/index.js';
import { toPublicUser } from '../utils/userMapper.js';
import { hashPassword } from './authService.js';

/**
 * Lists non-deleted users for the admin management screen,
 * excluding the signed-in admin so they cannot manage themselves.
 *
 * @param actorId - Authenticated admin id
 * @returns Public user records other than the actor
 */
export async function listUsers(actorId: string): Promise<PublicUser[]> {
  const users = await userRepository.findAllUsers();
  return users.filter((user) => user.id !== actorId).map(toPublicUser);
}

/**
 * Loads one non-deleted user by id.
 *
 * @param userId - Target user
 * @returns Public user record
 * @throws {AppError} If the user does not exist
 */
export async function getUser(userId: string): Promise<PublicUser> {
  const user = await userRepository.findUserById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  return toPublicUser(user);
}

/**
 * Creates a user account (admin-only operational create).
 * Invite-accept remains the product onboarding path.
 *
 * @param input - Email, password, and role
 * @param createdBy - Acting admin id
 * @returns The created public user
 * @throws {AppError} If the email is already in use
 */
export async function createUser(input: CreateUserInput, createdBy: string): Promise<PublicUser> {
  const existing = await userRepository.findUserByEmail(input.email);
  if (existing) {
    throw new AppError('A user with this email already exists', 409);
  }

  const passwordHash = await hashPassword(input.password);
  const user = await userRepository.createUser(input.email, passwordHash, input.role, createdBy);
  return toPublicUser(user);
}

/**
 * Updates email, role, and access for a non-deleted user.
 *
 * @param userId - Target user
 * @param input - Updated fields
 * @param updatedBy - Acting admin id
 * @returns The updated public user
 * @throws {AppError} If the user is missing or the email is taken
 */
export async function updateUser(
  userId: string,
  input: UpdateUserInput,
  updatedBy: string,
): Promise<PublicUser> {
  const current = await userRepository.findUserById(userId);
  if (!current) {
    throw new AppError('User not found', 404);
  }

  if (input.email !== current.email) {
    const existing = await userRepository.findUserByEmail(input.email);
    if (existing) {
      throw new AppError('A user with this email already exists', 409);
    }
  }

  const user = await userRepository.updateUser(userId, input, updatedBy);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  return toPublicUser(user);
}

/**
 * Enables or disables a user's access.
 *
 * @param userId - Target user
 * @param isActive - Desired active flag
 * @param updatedBy - Acting admin id
 * @returns The updated public user
 * @throws {AppError} If the user does not exist or the actor disables themselves
 */
export async function setUserAccess(
  userId: string,
  isActive: boolean,
  updatedBy: string,
): Promise<PublicUser> {
  if (userId === updatedBy && !isActive) {
    throw new AppError('You cannot disable your own account', 400);
  }

  const user = await userRepository.setUserActive(userId, isActive, updatedBy);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  if (!isActive) {
    await refreshTokenRepository.revokeRefreshTokensForUser(userId, updatedBy);
  }
  return toPublicUser(user);
}

/**
 * Soft-deletes a user. Admins cannot delete their own account.
 *
 * @param userId - Target user
 * @param deletedBy - Acting admin id
 * @throws {AppError} If the user is missing or the actor is deleting themselves
 */
export async function deleteUser(userId: string, deletedBy: string): Promise<void> {
  if (userId === deletedBy) {
    throw new AppError('You cannot delete your own account', 400);
  }

  const user = await userRepository.softDeleteUser(userId, deletedBy);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  await refreshTokenRepository.revokeRefreshTokensForUser(userId, deletedBy);
}
