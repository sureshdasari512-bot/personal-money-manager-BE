import { randomBytes } from 'node:crypto';
import { env, PASSWORD_RESET_EXPIRY_HOURS } from '../config/env.js';
import { db } from '../config/database.js';
import { EMAIL_JOB } from '../config/jobs.js';
import { enqueueEmail } from '../queues/emailQueue.js';
import * as passwordResetRepository from '../repositories/passwordResetRepository.js';
import * as refreshTokenRepository from '../repositories/refreshTokenRepository.js';
import * as userRepository from '../repositories/userRepository.js';
import { AppError, type PublicUser } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { buildPasswordResetEmail } from '../utils/passwordResetEmail.js';
import {
  DISABLED_ACCOUNT_RESET_MESSAGE,
  FORGOT_PASSWORD_SUCCESS_MESSAGE,
  INVALID_RESET_LINK_MESSAGE,
  UNKNOWN_ACCOUNT_RESET_MESSAGE,
} from '../utils/passwordResetMessage.js';
import { hashToken } from '../utils/tokenHash.js';
import { toPublicUser } from '../utils/userMapper.js';
import { hashPassword } from './authService.js';
import {
  assertPasswordResetNotLocked,
  recordPasswordResetRequest,
} from './passwordResetAttemptService.js';

/**
 * Accepts a forgot-password request and queues a reset email for active users.
 *
 * @param email - Address entered on the form
 * @returns Confirmation copy after the mail is queued
 * @throws {AppError} 400 unknown email, 403 disabled, 429 when locked
 */
export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  await assertPasswordResetNotLocked(email);
  await recordPasswordResetRequest(email);

  const user = await userRepository.findUserByEmail(email);
  if (!user) {
    throw new AppError(UNKNOWN_ACCOUNT_RESET_MESSAGE, 400, {
      email: UNKNOWN_ACCOUNT_RESET_MESSAGE,
    });
  }
  if (!user.isActive) {
    throw new AppError(DISABLED_ACCOUNT_RESET_MESSAGE, 403, {
      email: DISABLED_ACCOUNT_RESET_MESSAGE,
    });
  }

  const rawToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000);

  const tokenRow = await db.withTransaction(async (query) => {
    await passwordResetRepository.revokeUnusedPasswordResetTokensForUser(user.id, user.id, query);
    return passwordResetRepository.createPasswordResetToken(
      user.id,
      hashToken(rawToken),
      expiresAt,
      user.id,
      query,
    );
  });

  const content = buildPasswordResetEmail({
    token: rawToken,
    frontendOrigin: env.frontendOrigin,
  });
  try {
    await enqueueEmail(
      {
        to: user.email,
        subject: content.subject,
        html: content.html,
        text: content.text,
      },
      EMAIL_JOB.names.passwordReset,
      `reset-${tokenRow.id}`,
    );
  } catch (err) {
    logger.error({ err, userId: user.id }, 'Failed to enqueue password-reset email');
    throw new AppError('We could not send the reset email. Try again in a few minutes.', 503);
  }

  return { message: FORGOT_PASSWORD_SUCCESS_MESSAGE };
}

/**
 * Consumes a reset token, sets a new password, and revokes every session.
 *
 * @param token - Raw token from the email link
 * @param password - New password
 * @returns Public user to sign in
 * @throws {AppError} If the link is missing, used, revoked, expired, or the account is disabled
 */
export async function resetPassword(token: string, password: string): Promise<PublicUser> {
  const tokenHash = hashToken(token.trim());

  const user = await db.withTransaction(async (query) => {
    const stored = await passwordResetRepository.findPasswordResetTokenByHashForUpdate(
      query,
      tokenHash,
    );
    if (!stored || stored.usedAt || stored.revokedAt) {
      throw new AppError(INVALID_RESET_LINK_MESSAGE, 400);
    }
    if (stored.expiresAt.getTime() < Date.now()) {
      throw new AppError(INVALID_RESET_LINK_MESSAGE, 400);
    }

    const owner = await userRepository.findUserByIdForUpdate(query, stored.userId);
    if (!owner) {
      throw new AppError(INVALID_RESET_LINK_MESSAGE, 400);
    }
    if (!owner.isActive) {
      throw new AppError(DISABLED_ACCOUNT_RESET_MESSAGE, 403, {
        email: DISABLED_ACCOUNT_RESET_MESSAGE,
      });
    }

    const passwordHash = await hashPassword(password);
    await userRepository.updatePasswordHash(owner.id, passwordHash, owner.id, query);
    const consumed = await passwordResetRepository.markPasswordResetTokenUsed(
      stored.id,
      owner.id,
      query,
    );
    if (!consumed) {
      throw new AppError(INVALID_RESET_LINK_MESSAGE, 400);
    }
    await refreshTokenRepository.revokeRefreshTokensForUser(owner.id, owner.id, query);
    return owner;
  });

  return toPublicUser(user);
}
