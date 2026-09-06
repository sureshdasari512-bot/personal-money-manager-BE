import { db } from '../config/database.js';
import type { User, UserRole } from '../types/index.js';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  created_by: string | null;
  updated_by: string | null;
  deleted_by: string | null;
}

const USER_COLUMNS = `
  id, email, password_hash, role, is_active,
  created_at, updated_at, deleted_at,
  created_by, updated_by, deleted_by
`;

/**
 * Maps a `users` table row to the domain User type.
 *
 * @param row - Raw snake_case database row
 * @returns CamelCase domain user
 */
function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    deletedBy: row.deleted_by,
  };
}

/**
 * Finds a non-deleted user by email address.
 *
 * @param email - Login / invite email
 * @returns The user or null when no row exists
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await db.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users
     WHERE email = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [email],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

/**
 * Finds a non-deleted user by primary key.
 *
 * @param id - User id
 * @returns The user or null when no row exists
 */
export async function findUserById(id: string): Promise<User | null> {
  const result = await db.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users
     WHERE id = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [id],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

/**
 * Lists all non-deleted users, newest first.
 *
 * @returns Domain user records
 */
export async function findAllUsers(): Promise<User[]> {
  const result = await db.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users
     WHERE deleted_at IS NULL
     ORDER BY created_at DESC`,
  );
  return result.rows.map(mapUser);
}

/**
 * Inserts a new user row.
 *
 * @param email - Unique email
 * @param passwordHash - bcrypt hash
 * @param role - Assigned role
 * @param createdBy - Acting admin id, or null for the first bootstrap account
 * @returns The newly created user
 */
export async function createUser(
  email: string,
  passwordHash: string,
  role: UserRole,
  createdBy: string | null,
): Promise<User> {
  const result = await db.query<UserRow>(
    `INSERT INTO users (email, password_hash, role, is_active, created_by, updated_by)
     VALUES ($1, $2, $3, true, $4, $4)
     RETURNING ${USER_COLUMNS}`,
    [email, passwordHash, role, createdBy],
  );
  return mapUser(result.rows[0]);
}

/**
 * Updates mutable user fields and audit columns.
 *
 * @param userId - Target user
 * @param input - Email, role, and active flag
 * @param updatedBy - Acting admin id
 * @returns The updated user or null
 */
export async function updateUser(
  userId: string,
  input: { email: string; role: UserRole; isActive: boolean },
  updatedBy: string,
): Promise<User | null> {
  const result = await db.query<UserRow>(
    `UPDATE users
     SET email = $2,
         role = $3,
         is_active = $4,
         updated_at = NOW(),
         updated_by = $5
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING ${USER_COLUMNS}`,
    [userId, input.email, input.role, input.isActive, updatedBy],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

/**
 * Enables or disables a user's access without deleting the account.
 *
 * @param userId - Target user
 * @param isActive - Whether the account may log in
 * @param updatedBy - Acting admin id
 * @returns The updated user or null
 */
export async function setUserActive(
  userId: string,
  isActive: boolean,
  updatedBy: string,
): Promise<User | null> {
  const result = await db.query<UserRow>(
    `UPDATE users
     SET is_active = $2,
         updated_at = NOW(),
         updated_by = $3
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING ${USER_COLUMNS}`,
    [userId, isActive, updatedBy],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

/**
 * Soft-deletes a user so the email unique constraint and audit trail stay intact.
 *
 * @param userId - Target user
 * @param deletedBy - Acting admin id
 * @returns The soft-deleted user or null
 */
export async function softDeleteUser(userId: string, deletedBy: string): Promise<User | null> {
  const result = await db.query<UserRow>(
    `UPDATE users
     SET deleted_at = NOW(),
         deleted_by = $2,
         is_active = false,
         updated_at = NOW(),
         updated_by = $2
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING ${USER_COLUMNS}`,
    [userId, deletedBy],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}
