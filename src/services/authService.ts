import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import {
  ACCESS_TOKEN_MAX_AGE_MS,
  env,
  REFRESH_TOKEN_MAX_AGE_MS,
} from '../config/env.js';
import * as refreshTokenRepository from '../repositories/refreshTokenRepository.js';
import * as userRepository from '../repositories/userRepository.js';
import { AppError, type AuthTokenPayload, type PublicUser, type User } from '../types/index.js';
import { hashToken } from '../utils/tokenHash.js';
import { toPublicUser } from '../utils/userMapper.js';
import {
  assertLoginNotLocked,
  clearLoginAttempts,
  recordFailedLogin,
} from './loginAttemptService.js';

/**
 * Builds cookie options for cross-origin FE/BE deployments.
 *
 * @param maxAge - Cookie lifetime in milliseconds
 * @returns Express cookie options
 */
function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSecure ? ('none' as const) : ('lax' as const),
    maxAge,
  };
}

/**
 * Issues a signed access JWT and sets it as an httpOnly cookie.
 *
 * @param res - Express response that receives the cookie
 * @param user - Authenticated user
 */
export function issueAccessTokenCookie(res: Response, user: Pick<User, 'id' | 'role'>): void {
  const token = jwt.sign({ userId: user.id, role: user.role } satisfies AuthTokenPayload, env.jwtSecret, {
    expiresIn: '15m',
  });
  res.cookie('accessToken', token, cookieOptions(ACCESS_TOKEN_MAX_AGE_MS));
}

/**
 * Sets the raw refresh token cookie. The database stores only the hash.
 *
 * @param res - Express response that receives the cookie
 * @param rawToken - Opaque refresh token
 */
function setRefreshTokenCookie(res: Response, rawToken: string): void {
  res.cookie('refreshToken', rawToken, cookieOptions(REFRESH_TOKEN_MAX_AGE_MS));
}

/**
 * Clears auth cookies on logout.
 *
 * @param res - Express response
 */
export function clearAuthCookies(res: Response): void {
  res.clearCookie('accessToken', cookieOptions(0));
  res.clearCookie('refreshToken', cookieOptions(0));
}

/**
 * Creates a persisted refresh session and sets both auth cookies.
 *
 * @param res - Express response
 * @param user - Session owner
 * @param actorId - Who started the session
 */
export async function startSession(
  res: Response,
  user: Pick<User, 'id' | 'role'>,
  actorId: string,
): Promise<void> {
  const rawToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS);
  await refreshTokenRepository.createRefreshToken(user.id, hashToken(rawToken), expiresAt, actorId);
  issueAccessTokenCookie(res, user);
  setRefreshTokenCookie(res, rawToken);
}

/**
 * Authenticates an email/password pair and returns the public user.
 *
 * @param email - Login email
 * @param password - Plain-text password
 * @returns Public user record
 * @throws {AppError} If credentials are invalid (401), locked (429), or disabled (403)
 */
export async function login(email: string, password: string): Promise<PublicUser> {
  await assertLoginNotLocked(email);

  const user = await userRepository.findUserByEmail(email);
  if (!user) {
    throw await recordFailedLogin(email);
  }
  if (!user.isActive) {
    throw new AppError('This account is disabled. Contact your administrator.', 403, {
      email: 'This account is disabled',
    });
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    throw await recordFailedLogin(email);
  }

  await clearLoginAttempts(email);
  return toPublicUser(user);
}

/**
 * Rotates a refresh token and issues a new access cookie.
 * Reuse of a revoked token revokes every session for that user.
 *
 * @param res - Express response that receives new cookies
 * @param rawToken - Refresh token from the cookie
 * @returns The session owner
 * @throws {AppError} If the refresh token is missing, expired, or revoked
 */
export async function refreshSession(res: Response, rawToken: string | undefined): Promise<PublicUser> {
  if (!rawToken) {
    throw new AppError('No refresh token provided', 401);
  }

  const stored = await refreshTokenRepository.findRefreshTokenByHash(hashToken(rawToken));
  if (!stored) {
    throw new AppError('Invalid or expired session', 401);
  }

  if (stored.revokedAt) {
    await refreshTokenRepository.revokeRefreshTokensForUser(stored.userId, stored.userId);
    throw new AppError('Session is no longer valid', 401);
  }

  if (stored.expiresAt.getTime() < Date.now()) {
    throw new AppError('Invalid or expired session', 401);
  }

  const user = await userRepository.findUserById(stored.userId);
  if (!user || !user.isActive) {
    throw new AppError('Account is unavailable', 401);
  }

  await refreshTokenRepository.revokeRefreshToken(stored.id, user.id);
  await startSession(res, user, user.id);
  return toPublicUser(user);
}

/**
 * Revokes the current refresh token if present.
 *
 * @param rawToken - Refresh token from the cookie
 */
export async function endSession(rawToken: string | undefined): Promise<void> {
  if (!rawToken) {
    return;
  }

  const stored = await refreshTokenRepository.findRefreshTokenByHash(hashToken(rawToken));
  if (!stored || stored.revokedAt) {
    return;
  }

  await refreshTokenRepository.revokeRefreshToken(stored.id, stored.userId);
}

/**
 * Loads the current user from a verified token payload.
 *
 * @param userId - Authenticated user id
 * @returns Public user record
 * @throws {AppError} If the user no longer exists or is disabled
 */
export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await userRepository.findUserById(userId);
  if (!user || !user.isActive) {
    throw new AppError('Account is unavailable', 401);
  }
  return toPublicUser(user);
}

/**
 * Hashes a password with the configured bcrypt cost factor.
 *
 * @param password - Plain-text password
 * @returns bcrypt hash
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.bcryptCost);
}
