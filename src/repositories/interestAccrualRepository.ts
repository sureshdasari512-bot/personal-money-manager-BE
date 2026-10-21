import { db } from '../config/database.js';
import type { InterestAccrual, SqlQuery } from '../types/index.js';
import { toIsoDate } from '../utils/isoDate.js';

interface InterestAccrualRow {
  id: string;
  transaction_id: string;
  user_id: string;
  period_start_date: Date | string;
  period_end_date: Date | string | null;
  opening_balance_cents: string | number;
  interest_rate_bps: number;
  days_count: number;
  daily_interest_cents: string | number;
  accrued_interest_cents: string | number;
  created_at: Date;
  created_by: string | null;
  updated_at: Date;
  updated_by: string | null;
}

const ACCRUAL_COLUMNS = `
  id, transaction_id, user_id,
  period_start_date, period_end_date,
  opening_balance_cents, interest_rate_bps,
  days_count, daily_interest_cents, accrued_interest_cents,
  created_at, created_by, updated_at, updated_by
`;

// Maps a raw DB row to the domain type.
function mapAccrual(row: InterestAccrualRow): InterestAccrual {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    userId: row.user_id,
    periodStartDate: toIsoDate(row.period_start_date),
    periodEndDate: row.period_end_date ? toIsoDate(row.period_end_date) : null,
    openingBalanceCents: Number(row.opening_balance_cents),
    interestRateBps: Number(row.interest_rate_bps),
    daysCount: Number(row.days_count),
    dailyInterestCents: Number(row.daily_interest_cents),
    accruedInterestCents: Number(row.accrued_interest_cents),
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * Returns the total accrued interest in cents for a transaction across all segments.
 *
 * @param transactionId - The transaction to sum accruals for
 * @returns Total accrued interest in cents, or 0 if no segments exist
 */
export async function sumAccruedInterestCents(transactionId: string): Promise<number> {
  const result = await db.query<{ total: string | number }>(
    `SELECT GREATEST(
       COALESCE(SUM(ia.accrued_interest_cents), 0)
       - COALESCE((
           SELECT SUM(r.amount_cents - r.toward_principal_cents)
           FROM repayments r
           WHERE r.transaction_id = $1 AND r.deleted_at IS NULL
         ), 0),
       0
     ) AS total
     FROM interest_accruals ia
     WHERE ia.transaction_id = $1`,
    [transactionId],
  );
  return Number(result.rows[0]?.total ?? 0);
}

/**
 * Returns the total accrued interest in cents for many transactions in one query.
 *
 * @param transactionIds - Transaction ids to sum accruals for
 * @returns Map of transaction id → total accrued interest cents
 */
export async function sumAccruedInterestCentsByIds(
  transactionIds: string[],
): Promise<Record<string, number>> {
  if (transactionIds.length === 0) {
    return {};
  }
  const result = await db.query<{ transaction_id: string; total: string | number }>(
    `SELECT
       ia.transaction_id,
       GREATEST(
         COALESCE(SUM(ia.accrued_interest_cents), 0)
         - COALESCE((
             SELECT SUM(r.amount_cents - r.toward_principal_cents)
             FROM repayments r
             WHERE r.transaction_id = ia.transaction_id AND r.deleted_at IS NULL
           ), 0),
         0
       ) AS total
     FROM interest_accruals ia
     WHERE ia.transaction_id = ANY($1::uuid[])
     GROUP BY ia.transaction_id`,
    [transactionIds],
  );
  return Object.fromEntries(
    result.rows.map((row) => [row.transaction_id, Number(row.total)]),
  );
}

/**
 * Lists all accrual segments for a transaction, oldest first.
 *
 * @param transactionId - The transaction whose history to fetch
 * @returns Segments ordered by period_start_date ASC
 */
export async function findByTransactionId(transactionId: string): Promise<InterestAccrual[]> {
  const result = await db.query<InterestAccrualRow>(
    `SELECT ${ACCRUAL_COLUMNS}
     FROM interest_accruals
     WHERE transaction_id = $1
     ORDER BY period_start_date ASC`,
    [transactionId],
  );
  return result.rows.map(mapAccrual);
}

/**
 * Returns the currently-open accrual segment (period_end_date IS NULL), or null
 * if no open segment exists.
 *
 * @param transactionId - Parent transaction
 * @returns Open segment or null
 */
export async function findOpenSegment(
  transactionId: string,
): Promise<InterestAccrual | null> {
  const result = await db.query<InterestAccrualRow>(
    `SELECT ${ACCRUAL_COLUMNS}
     FROM interest_accruals
     WHERE transaction_id = $1
       AND period_end_date IS NULL
     LIMIT 1`,
    [transactionId],
  );
  return result.rows[0] ? mapAccrual(result.rows[0]) : null;
}

export interface OpenSegmentInput {
  transactionId: string;
  periodStartDate: string;
  openingBalanceCents: number;
  interestRateBps: number;
  daysCount: number;
  dailyInterestCents: number;
  accruedInterestCents: number;
}

/**
 * Inserts a new open segment (period_end_date = NULL).
 * The unique index on (transaction_id) WHERE period_end_date IS NULL
 * guarantees at most one open segment per transaction.
 *
 * @param userId - Acting user (audit columns)
 * @param input - Segment data
 * @param query - Optional query bound to an open DB transaction
 * @returns The inserted segment
 */
export async function createOpenSegment(
  userId: string,
  input: OpenSegmentInput,
  query: SqlQuery = db.query,
): Promise<InterestAccrual> {
  const result = await query<InterestAccrualRow>(
    `INSERT INTO interest_accruals
       (transaction_id, user_id,
        period_start_date, period_end_date,
        opening_balance_cents, interest_rate_bps,
        days_count, daily_interest_cents, accrued_interest_cents,
        created_by, updated_by)
     VALUES ($1, $2, $3::date, NULL, $4, $5, $6, $7, $8, $2, $2)
     ON CONFLICT (transaction_id, period_start_date) DO UPDATE
       SET days_count             = EXCLUDED.days_count,
           accrued_interest_cents = EXCLUDED.accrued_interest_cents,
           period_end_date        = EXCLUDED.period_end_date,
           updated_by             = $2
     RETURNING ${ACCRUAL_COLUMNS}`,
    [
      input.transactionId,
      userId,
      input.periodStartDate,
      input.openingBalanceCents,
      input.interestRateBps,
      input.daysCount,
      input.dailyInterestCents,
      input.accruedInterestCents,
    ],
  );
  return mapAccrual(result.rows[0]!);
}

export interface UpdateOpenSegmentInput {
  daysCount: number;
  accruedInterestCents: number;
}

/**
 * Refreshes the running totals on the open segment.
 * Called on every accrual run so the displayed interest stays current.
 *
 * @param userId - Acting user
 * @param transactionId - Parent transaction
 * @param input - Updated day count and total interest
 * @param query - Optional query bound to an open DB transaction
 * @returns Updated segment, or null if no open segment exists
 */
export async function updateOpenSegment(
  userId: string,
  transactionId: string,
  input: UpdateOpenSegmentInput,
  query: SqlQuery = db.query,
): Promise<InterestAccrual | null> {
  const result = await query<InterestAccrualRow>(
    `UPDATE interest_accruals
     SET days_count            = $3,
         accrued_interest_cents = $4,
         updated_by             = $2
     WHERE transaction_id = $1
       AND period_end_date IS NULL
     RETURNING ${ACCRUAL_COLUMNS}`,
    [transactionId, userId, input.daysCount, input.accruedInterestCents],
  );
  return result.rows[0] ? mapAccrual(result.rows[0]) : null;
}

/**
 * Closes the open segment by setting period_end_date.
 * Called when a rate changes, a repayment is made, or the transaction is settled.
 *
 * @param userId - Acting user
 * @param transactionId - Parent transaction
 * @param periodEndDate - Exclusive end date (YYYY-MM-DD)
 * @param finalDaysCount - Final day count for this segment
 * @param finalAccruedCents - Final accrued interest for this segment
 * @param query - Optional query bound to an open DB transaction
 * @returns Whether a segment was closed
 */
export async function closeOpenSegment(
  userId: string,
  transactionId: string,
  periodEndDate: string,
  finalDaysCount: number,
  finalAccruedCents: number,
  query: SqlQuery = db.query,
): Promise<boolean> {
  const result = await query<{ id: string }>(
    `UPDATE interest_accruals
     SET period_end_date        = $3::date,
         days_count             = $4,
         accrued_interest_cents = $5,
         updated_by             = $2
     WHERE transaction_id = $1
       AND period_end_date IS NULL
     RETURNING id`,
    [transactionId, userId, periodEndDate, finalDaysCount, finalAccruedCents],
  );
  return result.rows.length > 0;
}

/**
 * Returns the daily interest in cents from the open segment for each transaction.
 * Only pending transactions have an open segment (period_end_date IS NULL).
 *
 * @param transactionIds - Transaction ids to look up
 * @returns Map of transaction id → daily interest cents (0 if no open segment)
 */
export async function getDailyInterestCentsByIds(
  transactionIds: string[],
): Promise<Record<string, number>> {
  if (transactionIds.length === 0) {
    return {};
  }
  const result = await db.query<{ transaction_id: string; daily_interest_cents: string | number }>(
    `SELECT transaction_id, daily_interest_cents
     FROM interest_accruals
     WHERE transaction_id = ANY($1::uuid[])
       AND period_end_date IS NULL`,
    [transactionIds],
  );
  return Object.fromEntries(
    result.rows.map((row) => [row.transaction_id, Number(row.daily_interest_cents)]),
  );
}

/**
 * Hard-deletes ALL accrual rows for a transaction.
 * Called when interest config is removed so no stale interest amounts remain.
 *
 * @param transactionId - Parent transaction
 * @param query - Optional query bound to an open DB transaction
 */
export async function deleteAllAccruals(
  transactionId: string,
  query: SqlQuery = db.query,
): Promise<void> {
  await query(
    `DELETE FROM interest_accruals WHERE transaction_id = $1`,
    [transactionId],
  );
}
