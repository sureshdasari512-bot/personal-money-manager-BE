import { getRedisCommands } from '../config/redis.js';
import { AppError } from '../types/index.js';
import { logger } from '../utils/logger.js';
import {
  formatLoginAttemptMessage,
  LOGIN_ATTEMPT_WINDOW_MINUTES,
  MAX_LOGIN_ATTEMPTS,
} from '../utils/loginAttemptMessage.js';

const WINDOW_SECONDS = LOGIN_ATTEMPT_WINDOW_MINUTES * 60;

/**
 * Builds the Redis key for failed logins on one email.
 *
 * @param email - Login email (normalized)
 * @returns Redis key
 */
function attemptKey(email: string): string {
  return `login-attempts:${email.trim().toLowerCase()}`;
}

/**
 * Rejects login when the email already used all attempts in the window.
 *
 * @param email - Login email
 * @throws {AppError} 429 when locked
 */
export async function assertLoginNotLocked(email: string): Promise<void> {
  const failed = await readAttempts(email);
  if (failed >= MAX_LOGIN_ATTEMPTS) {
    throw new AppError(formatLoginAttemptMessage(failed), 429);
  }
}

/**
 * Records a failed password/email attempt and returns the client error.
 *
 * @param email - Login email
 * @returns AppError 401 with remaining-attempt copy, or 429 when locked
 */
export async function recordFailedLogin(email: string): Promise<AppError> {
  const failed = await incrementAttempts(email);
  if (failed >= MAX_LOGIN_ATTEMPTS) {
    return new AppError(formatLoginAttemptMessage(failed), 429);
  }
  return new AppError(formatLoginAttemptMessage(failed), 401, {
    password: 'Invalid email or password',
  });
}

/**
 * Clears the failed-attempt counter after a successful login (back to 0).
 *
 * @param email - Login email
 */
export async function clearLoginAttempts(email: string): Promise<void> {
  try {
    await getRedisCommands().del(attemptKey(email));
  } catch (err) {
    logger.error({ err }, 'Failed to clear login attempts');
  }
}

/**
 * Reads the current failed-attempt count.
 *
 * @param email - Login email
 * @returns Count, or 0 if Redis is unavailable
 */
async function readAttempts(email: string): Promise<number> {
  try {
    const raw = await getRedisCommands().get(attemptKey(email));
    return raw ? Number(raw) : 0;
  } catch (err) {
    logger.error({ err }, 'Failed to read login attempts');
    return 0;
  }
}

/**
 * Increments the failed-attempt counter and sets the 15-minute window on first fail.
 *
 * @param email - Login email
 * @returns New count, or 1 if Redis is unavailable
 */
async function incrementAttempts(email: string): Promise<number> {
  try {
    const redis = getRedisCommands();
    const key = attemptKey(email);
    const failed = await redis.incr(key);
    if (failed === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }
    return failed;
  } catch (err) {
    logger.error({ err }, 'Failed to increment login attempts');
    return 1;
  }
}
