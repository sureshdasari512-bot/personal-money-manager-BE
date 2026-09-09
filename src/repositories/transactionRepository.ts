import { db } from '../config/database.js';
import type {
  SqlQuery,
  Transaction,
  TransactionStatus,
  UpsertTransactionInput,
} from '../types/index.js';
import { toIsoDate } from '../utils/isoDate.js';

interface TransactionRow {
  id: string;
  user_id: string;
  person_id: string;
  type: Transaction['type'];
  status: TransactionStatus;
  amount_cents: string | number;
  transaction_date: Date | string;
  due_date: Date | string | null;
  notes: string | null;
  deleted_at: Date | null;
  deleted_by: string | null;
  created_at: Date;
  created_by: string | null;
  updated_at: Date;
  updated_by: string | null;
}

const TRANSACTION_COLUMNS = `
  id, user_id, person_id, type, status, amount_cents, transaction_date, due_date, notes,
  deleted_at, deleted_by, created_at, created_by, updated_at, updated_by
`;

/**
 * Maps a `transactions` table row to the domain type.
 * `amount_cents` is bigint, so node-pg may return it as a string.
 *
 * @param row - Raw snake_case database row
 * @returns CamelCase transaction
 */
function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    userId: row.user_id,
    personId: row.person_id,
    type: row.type,
    status: row.status,
    amountCents: Number(row.amount_cents),
    transactionDate: toIsoDate(row.transaction_date),
    dueDate: row.due_date ? toIsoDate(row.due_date) : null,
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
 * Fetches all non-deleted transactions for a given user and person.
 *
 * @param userId - ID of the authenticated user
 * @param personId - ID of the person whose transactions to fetch
 * @returns Array of transaction rows, newest date first
 */
export async function findTransactionsByPerson(
  userId: string,
  personId: string,
): Promise<Transaction[]> {
  const result = await db.query<TransactionRow>(
    `SELECT ${TRANSACTION_COLUMNS} FROM transactions
     WHERE user_id = $1 AND person_id = $2 AND deleted_at IS NULL
     ORDER BY transaction_date DESC, created_at DESC`,
    [userId, personId],
  );
  return result.rows.map(mapTransaction);
}

/**
 * Finds one non-deleted transaction owned by the user.
 *
 * @param userId - Owner id
 * @param transactionId - Transaction id
 * @returns The transaction or null
 */
export async function findTransactionById(
  userId: string,
  transactionId: string,
): Promise<Transaction | null> {
  const result = await db.query<TransactionRow>(
    `SELECT ${TRANSACTION_COLUMNS} FROM transactions
     WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [userId, transactionId],
  );
  return result.rows[0] ? mapTransaction(result.rows[0]) : null;
}

/**
 * Locks one owned transaction row for the duration of a DB transaction.
 *
 * @param query - Query bound to the open transaction
 * @param userId - Owner id
 * @param transactionId - Transaction id
 * @returns The locked transaction or null
 */
export async function findTransactionByIdForUpdate(
  query: SqlQuery,
  userId: string,
  transactionId: string,
): Promise<Transaction | null> {
  const result = await query<TransactionRow>(
    `SELECT ${TRANSACTION_COLUMNS} FROM transactions
     WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL
     LIMIT 1
     FOR UPDATE`,
    [userId, transactionId],
  );
  return result.rows[0] ? mapTransaction(result.rows[0]) : null;
}

/**
 * Locks every active lend for a person, oldest first, for a FIFO payment.
 *
 * @param query - Query bound to the open transaction
 * @param userId - Owner id
 * @param personId - Person whose lends to lock
 * @returns Lend transactions ordered oldest first
 */
export async function findLendTransactionsByPersonForUpdate(
  query: SqlQuery,
  userId: string,
  personId: string,
): Promise<Transaction[]> {
  const result = await query<TransactionRow>(
    `SELECT ${TRANSACTION_COLUMNS} FROM transactions
     WHERE user_id = $1 AND person_id = $2 AND type = 'lend' AND deleted_at IS NULL
     ORDER BY transaction_date ASC, created_at ASC
     FOR UPDATE`,
    [userId, personId],
  );
  return result.rows.map(mapTransaction);
}

/**
 * Computes outstanding cents per transaction via SQL aggregation (amount - sum of active repayments).
 *
 * @param userId - Owner id
 * @param transactionIds - Transaction ids to include
 * @param query - Optional query bound to an open DB transaction
 * @returns Map of transaction id → outstanding cents
 */
export async function findOutstandingCentsByIds(
  userId: string,
  transactionIds: string[],
  query: SqlQuery = db.query,
): Promise<Record<string, number>> {
  if (transactionIds.length === 0) {
    return {};
  }

  const result = await query<{ id: string; outstanding_cents: string | number }>(
    `SELECT
       t.id,
       GREATEST(
         t.amount_cents - COALESCE(SUM(r.amount_cents) FILTER (WHERE r.deleted_at IS NULL), 0),
         0
       ) AS outstanding_cents
     FROM transactions t
     LEFT JOIN repayments r ON r.transaction_id = t.id
     WHERE t.user_id = $1 AND t.id = ANY($2::uuid[]) AND t.deleted_at IS NULL
     GROUP BY t.id, t.amount_cents`,
    [userId, transactionIds],
  );

  return Object.fromEntries(result.rows.map((row) => [row.id, Number(row.outstanding_cents)]));
}

/**
 * Inserts a lend or borrow transaction.
 *
 * @param userId - Owner id
 * @param input - Transaction fields (amounts already in cents)
 * @returns The created transaction
 */
export async function createTransaction(
  userId: string,
  input: UpsertTransactionInput,
): Promise<Transaction> {
  const result = await db.query<TransactionRow>(
    `INSERT INTO transactions
       (user_id, person_id, type, status, amount_cents, transaction_date, due_date, notes, created_by, updated_by)
     VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $1, $1)
     RETURNING ${TRANSACTION_COLUMNS}`,
    [
      userId,
      input.personId,
      input.type,
      input.amountCents,
      input.transactionDate,
      input.dueDate ?? null,
      input.notes ?? null,
    ],
  );
  return mapTransaction(result.rows[0]);
}

/**
 * Updates a transaction owned by the user.
 *
 * @param userId - Owner id
 * @param transactionId - Transaction id
 * @param input - Fields to replace
 * @returns The updated transaction or null
 */
export async function updateTransaction(
  userId: string,
  transactionId: string,
  input: UpsertTransactionInput,
): Promise<Transaction | null> {
  const result = await db.query<TransactionRow>(
    `UPDATE transactions
     SET person_id = $3,
         type = $4,
         amount_cents = $5,
         transaction_date = $6,
         due_date = $7,
         notes = $8,
         updated_by = $1
     WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL
     RETURNING ${TRANSACTION_COLUMNS}`,
    [
      userId,
      transactionId,
      input.personId,
      input.type,
      input.amountCents,
      input.transactionDate,
      input.dueDate ?? null,
      input.notes ?? null,
    ],
  );
  return result.rows[0] ? mapTransaction(result.rows[0]) : null;
}

/**
 * Soft-deletes a transaction (sets `deleted_at`) to preserve auditability.
 *
 * @param userId - Owner id
 * @param transactionId - Transaction id
 * @returns Whether a row was updated
 */
export async function softDeleteTransaction(
  userId: string,
  transactionId: string,
  query: SqlQuery = db.query,
): Promise<boolean> {
  const result = await query<{ id: string }>(
    `UPDATE transactions
     SET status = 'cancelled',
         deleted_at = NOW(),
         deleted_by = $1,
         updated_by = $1
     WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [userId, transactionId],
  );
  return result.rows.length > 0;
}

/**
 * Updates only the stored payment/cancel status on an owned transaction.
 *
 * @param userId - Owner id
 * @param transactionId - Transaction id
 * @param status - New status
 * @param query - Optional query bound to an open DB transaction
 * @returns Whether a row was updated
 */
export async function updateTransactionStatus(
  userId: string,
  transactionId: string,
  status: TransactionStatus,
  query: SqlQuery = db.query,
): Promise<boolean> {
  const result = await query<{ id: string }>(
    `UPDATE transactions
     SET status = $3,
         updated_by = $1
     WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [userId, transactionId, status],
  );
  return result.rows.length > 0;
}
