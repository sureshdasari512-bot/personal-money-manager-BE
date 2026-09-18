import { passwordResetRequestsKey } from '../config/jobs.js';
import { getRedisCommands } from '../config/redis.js';
import { AppError } from '../types/index.js';
import { logger } from '../utils/logger.js';
import {
  formatPasswordResetLockedMessage,
  MAX_PASSWORD_RESET_REQUESTS,
  PASSWORD_RESET_WINDOW_MINUTES,
} from '../utils/passwordResetMessage.js';

const WINDOW_SECONDS = PASSWORD_RESET_WINDOW_MINUTES * 60;

/**
 * Builds the Redis key for reset requests on one email.
 *
 * @param email - Request email (normalized)
 * @returns Redis key
 */
function requestKey(email: string): string {
  return passwordResetRequestsKey(email);
}

/**
 * Rejects a forgot-password request when the email already used this window.
 *
 * @param email - Request email
 * @throws {AppError} 429 when locked
 */
export async function assertPasswordResetNotLocked(email: string): Promise<void> {
  const used = await readRequests(email);
  if (used >= MAX_PASSWORD_RESET_REQUESTS) {
    throw new AppError(formatPasswordResetLockedMessage(), 429);
  }
}

/**
 * Counts one forgot-password request against the per-email window.
 *
 * @param email - Request email
 */
export async function recordPasswordResetRequest(email: string): Promise<void> {
  await incrementRequests(email);
}

/**
 * Reads the current request count.
 *
 * @param email - Request email
 * @returns Count, or 0 if Redis is unavailable
 */
async function readRequests(email: string): Promise<number> {
  try {
    const raw = await getRedisCommands().get(requestKey(email));
    return raw ? Number(raw) : 0;
  } catch (err) {
    logger.error({ err }, 'Failed to read password-reset request count');
    return 0;
  }
}

/**
 * Increments the request counter and sets the 15-minute window on first hit.
 *
 * @param email - Request email
 * @returns New count, or 1 if Redis is unavailable
 */
async function incrementRequests(email: string): Promise<number> {
  try {
    const redis = getRedisCommands();
    const key = requestKey(email);
    const used = await redis.incr(key);
    if (used === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }
    return used;
  } catch (err) {
    logger.error({ err }, 'Failed to increment password-reset request count');
    return 1;
  }
}
