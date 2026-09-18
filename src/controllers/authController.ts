import type { NextFunction, Request, Response } from 'express';
import { requireUser } from '../middlewares/requireUser.js';
import * as authService from '../services/authService.js';
import * as invitationService from '../services/invitationService.js';
import * as passwordResetService from '../services/passwordResetService.js';
import { logger } from '../utils/logger.js';
import { PASSWORD_UPDATED_SIGN_IN_MESSAGE } from '../utils/passwordResetMessage.js';

/**
 * POST /auth/login
 * Authenticates the user and sets httpOnly access/refresh cookies.
 */
export async function loginHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const user = await authService.login(email, password);
    await authService.startSession(res, { id: user.id, role: user.role }, user.id);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/refresh
 * Rotates the refresh token and issues a new access cookie.
 */
export async function refreshHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = req.cookies?.refreshToken as string | undefined;
    const user = await authService.refreshSession(res, rawToken);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/logout
 * Revokes the current refresh token and clears auth cookies.
 */
export async function logoutHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = req.cookies?.refreshToken as string | undefined;
    await authService.endSession(rawToken);
    authService.clearAuthCookies(res);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

/**
 * GET /auth/me
 * Returns the authenticated user.
 */
export async function meHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const user = await authService.getCurrentUser(userId);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/accept-invite
 * Activates an invited account and logs the user in.
 */
export async function acceptInviteHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { token, password } = req.body as { token: string; password: string };
    const user = await invitationService.acceptInvitation(token, password);
    await authService.startSession(res, { id: user.id, role: user.role }, user.id);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/forgot-password
 * Sends a reset email for an active account. Unknown or disabled emails return a field error.
 */
export async function forgotPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email } = req.body as { email: string };
    const result = await passwordResetService.requestPasswordReset(email);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/reset-password
 * Sets a new password from a valid email link and starts a session.
 */
export async function resetPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { token, password } = req.body as { token: string; password: string };
    const user = await passwordResetService.resetPassword(token, password);
    try {
      await authService.startSession(res, { id: user.id, role: user.role }, user.id);
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Password updated but session could not start');
      res.status(200).json({ user, message: PASSWORD_UPDATED_SIGN_IN_MESSAGE });
      return;
    }
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}
