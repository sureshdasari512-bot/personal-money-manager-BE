import { db } from '../config/database.js';
import type { RefreshToken, SqlQuery } from '../types/index.js';

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  revoked_by: string | null;
  created_at: Date;
  updated_at: Date;
  updated_by: string | null;
}

const REFRESH_TOKEN_COLUMNS = `
  id, user_id, token_hash, expires_at, revoked_at, revoked_by,
  created_at, updated_at, updated_by
`;

/**
 * Maps a `refresh_tokens` row to the domain type.
 *
 * @param row - Raw snake_case database row
 * @returns CamelCase refresh token
 */
function mapRefreshToken(row: RefreshTokenRow): RefreshToken {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * Inserts a hashed refresh token for a new session.
 *
 * @param userId - Session owner
 * @param tokenHash - SHA-256 of the raw cookie value
 * @param expiresAt - Session expiry
 * @param createdBy - Acting user id
 * @returns The inserted row
 */
export async function createRefreshToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
  createdBy: string,
): Promise<RefreshToken> {
  const result = await db.query<RefreshTokenRow>(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, updated_by)
     VALUES ($1, $2, $3, $4)
     RETURNING ${REFRESH_TOKEN_COLUMNS}`,
    [userId, tokenHash, expiresAt, createdBy],
  );
  return mapRefreshToken(result.rows[0]);
}

/**
 * Finds a refresh token by hash, including revoked rows (needed for reuse detection).
 *
 * @param tokenHash - SHA-256 of the raw cookie value
 * @returns The row or null
 */
export async function findRefreshTokenByHash(tokenHash: string): Promise<RefreshToken | null> {
  const result = await db.query<RefreshTokenRow>(
    `SELECT ${REFRESH_TOKEN_COLUMNS} FROM refresh_tokens
     WHERE token_hash = $1
     LIMIT 1`,
    [tokenHash],
  );
  return result.rows[0] ? mapRefreshToken(result.rows[0]) : null;
}

/**
 * Revokes one refresh token.
 *
 * @param id - Refresh token id
 * @param revokedBy - User ending the session
 */
export async function revokeRefreshToken(id: string, revokedBy: string): Promise<void> {
  await db.query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW(),
         revoked_by = $2,
         updated_by = $2
     WHERE id = $1 AND revoked_at IS NULL`,
    [id, revokedBy],
  );
}

/**
 * Revokes every active refresh token for a user (logout-all / force-logout).
 *
 * @param userId - Target user
 * @param revokedBy - Acting user or admin
 * @param query - Optional transaction query
 */
export async function revokeRefreshTokensForUser(
  userId: string,
  revokedBy: string,
  query: SqlQuery = db.query,
): Promise<void> {
  await query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW(),
         revoked_by = $2,
         updated_by = $2
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId, revokedBy],
  );
}
