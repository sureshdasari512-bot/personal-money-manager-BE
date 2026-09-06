import type { NextFunction, Request, Response } from 'express';
import { requireUser } from '../middlewares/requireUser.js';
import * as userService from '../services/userService.js';
import type { CreateUserInput, UpdateUserInput } from '../types/index.js';

/**
 * GET /users
 * Admin-only: lists non-deleted accounts except the signed-in admin.
 */
export async function listUsersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const users = await userService.listUsers(userId);
    res.status(200).json({ users });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /users/:userId
 * Admin-only: returns one account.
 */
export async function getUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req.params as { userId: string };
    const user = await userService.getUser(userId);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /users
 * Admin-only: creates an account.
 */
export async function createUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const user = await userService.createUser(req.body as CreateUserInput, userId);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /users/:userId
 * Admin-only: updates email, role, and access.
 */
export async function updateUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId: actorId } = requireUser(req);
    const { userId } = req.params as { userId: string };
    const user = await userService.updateUser(userId, req.body as UpdateUserInput, actorId);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /users/:userId/access
 * Admin-only: enable or disable a user.
 */
export async function setUserAccessHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId: actorId } = requireUser(req);
    const { userId } = req.params as { userId: string };
    const { isActive } = req.body as { isActive: boolean };
    const user = await userService.setUserAccess(userId, isActive, actorId);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /users/:userId
 * Admin-only: soft-deletes an account.
 */
export async function deleteUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId: actorId } = requireUser(req);
    const { userId } = req.params as { userId: string };
    await userService.deleteUser(userId, actorId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
