import { db } from '../config/database.js';
import type { CreateRepaymentInput, Repayment, SqlQuery } from '../types/index.js';
import { toIsoDate } from '../utils/isoDate.js';

interface RepaymentRow {
  id: string;
  transaction_id: string;
  amount_cents: string | number;
  paid_on: Date | string;
  notes: string | null;
  allocation_id: string | null;
  deleted_at: Date | null;
  deleted_by: string | null;
  created_at: Date;
  created_by: string | null;
  updated_at: Date;
  updated_by: string | null;
}

const REPAYMENT_COLUMNS = `
  id, transaction_id, amount_cents, paid_on, notes, allocation_id,
  deleted_at, deleted_by, created_at, created_by, updated_at, updated_by
`;

/**
 * Maps a `repayments` table row to the domain type.
 *
 * @param row - Raw snake_case database row
 * @returns CamelCase repayment
 */
function mapRepayment(row: RepaymentRow): Repayment {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    amountCents: Number(row.amount_cents),
    paidOn: toIsoDate(row.paid_on),
    notes: row.notes,
    allocationId: row.allocation_id,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * Lists active repayments for a transaction, oldest first.
 *
 * @param transactionId - Parent transaction
 * @param query - Optional query bound to an open DB transaction
 * @returns Repayment history
 */
export async function findRepaymentsByTransaction(
  transactionId: string,
  query: SqlQuery = db.query,
): Promise<Repayment[]> {
  const result = await query<RepaymentRow>(
    `SELECT ${REPAYMENT_COLUMNS} FROM repayments
     WHERE transaction_id = $1 AND deleted_at IS NULL
     ORDER BY paid_on ASC, created_at ASC`,
    [transactionId],
  );
  return result.rows.map(mapRepayment);
}

/**
 * Lists active repayments for many transactions in one query.
 *
 * @param transactionIds - Parent transaction ids
 * @returns Repayment history for those transactions
 */
export async function findRepaymentsByTransactionIds(
  transactionIds: string[],
): Promise<Repayment[]> {
  if (transactionIds.length === 0) {
    return [];
  }

  const result = await db.query<RepaymentRow>(
    `SELECT ${REPAYMENT_COLUMNS} FROM repayments
     WHERE transaction_id = ANY($1::uuid[]) AND deleted_at IS NULL
     ORDER BY paid_on ASC, created_at ASC`,
    [transactionIds],
  );
  return result.rows.map(mapRepayment);
}

/**
 * Counts active repayments on a transaction.
 *
 * @param transactionId - Parent transaction
 * @returns Number of non-deleted repayments
 */
export async function countActiveByTransaction(transactionId: string): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM repayments
     WHERE transaction_id = $1 AND deleted_at IS NULL`,
    [transactionId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * Inserts a repayment against a transaction.
 *
 * @param userId - Acting user (audit columns)
 * @param transactionId - Parent transaction
 * @param input - Amount, date, optional notes and allocation id
 * @param query - Query bound to the open DB transaction
 * @returns The created repayment
 */
export async function createRepayment(
  userId: string,
  transactionId: string,
  input: CreateRepaymentInput,
  query: SqlQuery = db.query,
): Promise<Repayment> {
  const result = await query<RepaymentRow>(
    `INSERT INTO repayments
       (transaction_id, amount_cents, paid_on, notes, allocation_id, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     RETURNING ${REPAYMENT_COLUMNS}`,
    [
      transactionId,
      input.amountCents,
      input.paidOn,
      input.notes ?? null,
      input.allocationId ?? null,
      userId,
    ],
  );
  return mapRepayment(result.rows[0]);
}

/**
 * Soft-deletes one repayment owned through the parent transaction's user.
 *
 * @param userId - Owner of the parent transaction
 * @param repaymentId - Repayment id
 * @returns Whether a row was updated
 */
export async function softDeleteRepayment(
  userId: string,
  repaymentId: string,
  query: SqlQuery = db.query,
): Promise<string | null> {
  const result = await query<{ transaction_id: string }>(
    `UPDATE repayments r
     SET deleted_at = NOW(),
         deleted_by = $1,
         updated_by = $1
     FROM transactions t
     WHERE r.id = $2
       AND r.deleted_at IS NULL
       AND r.transaction_id = t.id
       AND t.user_id = $1
       AND t.deleted_at IS NULL
     RETURNING r.transaction_id`,
    [userId, repaymentId],
  );
  return result.rows[0]?.transaction_id ?? null;
}

/**
 * Soft-deletes every active repayment on a transaction (cascade).
 *
 * @param userId - Acting user
 * @param transactionId - Parent transaction
 * @param query - Query bound to the open DB transaction
 * @returns Number of repayments marked deleted
 */
export async function softDeleteByTransaction(
  userId: string,
  transactionId: string,
  query: SqlQuery = db.query,
): Promise<number> {
  const result = await query<{ id: string }>(
    `UPDATE repayments
     SET deleted_at = NOW(),
         deleted_by = $1,
         updated_by = $1
     WHERE transaction_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [userId, transactionId],
  );
  return result.rows.length;
}
