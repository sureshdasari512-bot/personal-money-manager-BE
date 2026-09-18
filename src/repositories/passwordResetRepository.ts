import { db } from '../config/database.js';
import type { PasswordResetToken, SqlQuery } from '../types/index.js';

interface PasswordResetTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
  revoked_by: string | null;
  created_at: Date;
  updated_at: Date;
  updated_by: string | null;
}

const PASSWORD_RESET_TOKEN_COLUMNS = `
  id, user_id, token_hash, expires_at, used_at, revoked_at, revoked_by,
  created_at, updated_at, updated_by
`;

/**
 * Maps a `password_reset_tokens` row to the domain type.
 *
 * @param row - Raw snake_case database row
 * @returns CamelCase reset token
 */
function mapPasswordResetToken(row: PasswordResetTokenRow): PasswordResetToken {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * Inserts a hashed reset token for one user.
 *
 * @param userId - Account that requested the reset
 * @param tokenHash - SHA-256 of the raw emailed token
 * @param expiresAt - When the link stops working
 * @param createdBy - Acting user id
 * @param query - Optional transaction-bound query
 * @returns The inserted row
 */
export async function createPasswordResetToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
  createdBy: string,
  query: SqlQuery = db.query,
): Promise<PasswordResetToken> {
  const result = await query<PasswordResetTokenRow>(
    `INSERT INTO password_reset_tokens (
       user_id, token_hash, expires_at, updated_by
     )
     VALUES ($1, $2, $3, $4)
     RETURNING ${PASSWORD_RESET_TOKEN_COLUMNS}`,
    [userId, tokenHash, expiresAt, createdBy],
  );
  return mapPasswordResetToken(result.rows[0]);
}

/**
 * Locks a reset token row so two submits cannot consume it twice.
 *
 * @param query - Query bound to the open transaction
 * @param tokenHash - SHA-256 of the raw token
 * @returns The locked row or null
 */
export async function findPasswordResetTokenByHashForUpdate(
  query: SqlQuery,
  tokenHash: string,
): Promise<PasswordResetToken | null> {
  const result = await query<PasswordResetTokenRow>(
    `SELECT ${PASSWORD_RESET_TOKEN_COLUMNS}
     FROM password_reset_tokens
     WHERE token_hash = $1
     LIMIT 1
     FOR UPDATE`,
    [tokenHash],
  );
  return result.rows[0] ? mapPasswordResetToken(result.rows[0]) : null;
}

/**
 * Marks unused reset tokens for a user as revoked so only the newest link works.
 *
 * @param userId - Account owner
 * @param revokedBy - Acting user id
 * @param query - Optional transaction-bound query
 */
export async function revokeUnusedPasswordResetTokensForUser(
  userId: string,
  revokedBy: string,
  query: SqlQuery = db.query,
): Promise<void> {
  await query(
    `UPDATE password_reset_tokens
     SET revoked_at = NOW(),
         revoked_by = $2,
         updated_by = $2
     WHERE user_id = $1
       AND used_at IS NULL
       AND revoked_at IS NULL`,
    [userId, revokedBy],
  );
}

/**
 * Marks a reset token as consumed after the password is changed.
 *
 * @param id - Token row id
 * @param updatedBy - Acting user id
 * @param query - Optional transaction-bound query
 * @returns True when this call consumed the token
 */
export async function markPasswordResetTokenUsed(
  id: string,
  updatedBy: string,
  query: SqlQuery = db.query,
): Promise<boolean> {
  const result = await query<{ id: string }>(
    `UPDATE password_reset_tokens
     SET used_at = NOW(),
         updated_by = $2
     WHERE id = $1
       AND used_at IS NULL
       AND revoked_at IS NULL
     RETURNING id`,
    [id, updatedBy],
  );
  return result.rows.length > 0;
}
