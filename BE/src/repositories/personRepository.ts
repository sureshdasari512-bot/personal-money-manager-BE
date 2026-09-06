import { db } from '../config/database.js';
import type { Person, UpsertPersonInput } from '../types/index.js';

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
 * Lists active contacts belonging to the authenticated user.
 *
 * @param userId - Owner id
 * @returns The user's non-deleted contacts
 */
export async function findPeopleByUser(userId: string): Promise<Person[]> {
  const result = await db.query<PersonRow>(
    `SELECT ${PERSON_COLUMNS} FROM people
     WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY name ASC`,
    [userId],
  );
  return result.rows.map(mapPerson);
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
