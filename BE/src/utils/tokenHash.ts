import { createHash } from 'node:crypto';

/**
 * Hashes a raw refresh token for storage and lookup.
 * SHA-256 is used so we can find a session by hash without storing the raw value.
 *
 * @param rawToken - Opaque token sent in the httpOnly cookie
 * @returns Hex SHA-256 digest
 */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
