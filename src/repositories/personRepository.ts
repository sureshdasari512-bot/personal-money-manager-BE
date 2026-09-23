import { db } from '../config/database.js';
import type { Person, PeopleCursorParams, PeoplePage, UpsertPersonInput } from '../types/index.js';

interface PersonRow {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  deleted_at: Date | null;
  deleted_by: string | null;
  created_at: Date;
  created_by: string | null;
  updated_at: Date;
  updated_by: string | null;
}

const PERSON_COLUMNS = `
  id, user_id, name, phone, email, notes,
  deleted_at, deleted_by, created_at, created_by, updated_at, updated_by
`;

/**
 * Maps a `people` table row to the domain type.
 *
 * @param row - Raw snake_case database row
 * @returns CamelCase person
 */
function mapPerson(row: PersonRow): Person {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * Decodes a base64 cursor into its (created_at, id) components.
 *
 * @param cursor - Opaque base64 string from the previous page response
 * @returns Parsed cursor fields, or null if the cursor is absent/malformed
 */
function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const json = Buffer.from(cursor, 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'createdAt' in parsed &&
      'id' in parsed &&
      typeof (parsed as Record<string, unknown>).createdAt === 'string' &&
      typeof (parsed as Record<string, unknown>).id === 'string'
    ) {
      return parsed as { createdAt: string; id: string };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Encodes (created_at, id) into an opaque base64 cursor for the client.
 *
 * @param createdAt - ISO timestamp of the row
 * @param id - UUID of the row
 * @returns Base64 cursor string
 */
function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString('base64');
}

/**
 * Lists active contacts for a user using keyset (cursor) pagination, newest first.
 * Sort order is (created_at DESC, id DESC) — stable even when timestamps collide.
 * When `q` is supplied the search term is matched case-insensitively against
 * name, phone, and email using ILIKE; cursor pagination is disabled for search
 * results because the result set is small enough to return in full.
 *
 * @param userId - Owner id
 * @param params - Cursor, limit, and optional search query for the page
 * @returns One page of people plus a next-page cursor
 */
export async function findPeopleByUser(
  userId: string,
  params: PeopleCursorParams,
): Promise<PeoplePage> {
  const { cursor, limit, q } = params;

  // Search bypasses cursor pagination — return all matches up to limit
  if (q && q.trim().length > 0) {
    const pattern = `%${q.trim()}%`;
    const result = await db.query<PersonRow>(
      `SELECT ${PERSON_COLUMNS} FROM people
       WHERE user_id = $1
         AND deleted_at IS NULL
         AND (name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)
       ORDER BY name ASC
       LIMIT $3`,
      [userId, pattern, limit],
    );
    return { people: result.rows.map(mapPerson), nextCursor: null, hasMore: false };
  }

  // Normal cursor pagination (no search)
  const fetchLimit = limit + 1;
  const decoded = cursor ? decodeCursor(cursor) : null;

  let result: { rows: PersonRow[] };

  if (decoded) {
    result = await db.query<PersonRow>(
      `SELECT ${PERSON_COLUMNS} FROM people
       WHERE user_id = $1
         AND deleted_at IS NULL
         AND (created_at, id) < ($2, $3)
       ORDER BY created_at DESC, id DESC
       LIMIT $4`,
      [userId, decoded.createdAt, decoded.id, fetchLimit],
    );
  } else {
    result = await db.query<PersonRow>(
      `SELECT ${PERSON_COLUMNS} FROM people
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [userId, fetchLimit],
    );
  }

  const hasMore = result.rows.length > limit;
  const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
  const lastRow = rows[rows.length - 1];
  const nextCursor =
    hasMore && lastRow ? encodeCursor(lastRow.created_at, lastRow.id) : null;

  return { people: rows.map(mapPerson), nextCursor, hasMore };
}

/**
 * Finds one active person owned by the given user.
 *
 * @param userId - Owner id
 * @param personId - Person id
 * @returns The person or null
 */
export async function findPersonById(userId: string, personId: string): Promise<Person | null> {
  const result = await db.query<PersonRow>(
    `SELECT ${PERSON_COLUMNS} FROM people
     WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [userId, personId],
  );
  return result.rows[0] ? mapPerson(result.rows[0]) : null;
}

/**
 * Inserts a new contact for the authenticated user.
 *
 * @param userId - Owner id
 * @param input - Contact fields
 * @returns The created person
 */
export async function createPerson(userId: string, input: UpsertPersonInput): Promise<Person> {
  const result = await db.query<PersonRow>(
    `INSERT INTO people (user_id, name, phone, email, notes, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $1, $1)
     RETURNING ${PERSON_COLUMNS}`,
    [userId, input.name, input.phone ?? null, input.email ?? null, input.notes ?? null],
  );
  return mapPerson(result.rows[0]);
}

/**
 * Updates a contact owned by the user.
 *
 * @param userId - Owner id
 * @param personId - Person id
 * @param input - Fields to update
 * @returns The updated person or null
 */
export async function updatePerson(
  userId: string,
  personId: string,
  input: UpsertPersonInput,
): Promise<Person | null> {
  const result = await db.query<PersonRow>(
    `UPDATE people
     SET name = $3,
         phone = $4,
         email = $5,
         notes = $6,
         updated_by = $1
     WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL
     RETURNING ${PERSON_COLUMNS}`,
    [userId, personId, input.name, input.phone ?? null, input.email ?? null, input.notes ?? null],
  );
  return result.rows[0] ? mapPerson(result.rows[0]) : null;
}

/**
 * Soft-deletes a contact owned by the user.
 *
 * @param userId - Owner id
 * @param personId - Person id
 * @returns Whether a row was updated
 */
export async function softDeletePerson(userId: string, personId: string): Promise<boolean> {
  const result = await db.query<{ id: string }>(
    `UPDATE people
     SET deleted_at = NOW(),
         deleted_by = $1,
         updated_by = $1
     WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [userId, personId],
  );
  return result.rows.length > 0;
}
