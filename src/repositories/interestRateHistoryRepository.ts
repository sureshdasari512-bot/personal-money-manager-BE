import { db } from '../config/database.js';
import type { InterestRateHistory, SqlQuery } from '../types/index.js';
import { toIsoDate } from '../utils/isoDate.js';

interface InterestRateHistoryRow {
  id: string;
  transaction_id: string;
  user_id: string;
  interest_rate_bps: number;
  effective_from: Date | string;
  effective_to: Date | string | null;
  created_at: Date;
  created_by: string | null;
  updated_at: Date;
  updated_by: string | null;
}

const COLUMNS = `
  id, transaction_id, user_id, interest_rate_bps,
  effective_from, effective_to,
  created_at, created_by, updated_at, updated_by
`;

// Maps a raw DB row to the domain type.
function mapRow(row: InterestRateHistoryRow): InterestRateHistory {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    userId: row.user_id,
    interestRateBps: Number(row.interest_rate_bps),
    effectiveFrom: toIsoDate(row.effective_from),
    effectiveTo: row.effective_to ? toIsoDate(row.effective_to) : null,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * Returns all rate segments for a transaction in chronological order.
 * The open segment (effectiveTo = null) is last.
 *
 * @param transactionId - Parent transaction
 * @returns Rate history oldest-first
 */
export async function findByTransactionId(
  transactionId: string,
): Promise<InterestRateHistory[]> {
  const result = await db.query<InterestRateHistoryRow>(
    `SELECT ${COLUMNS}
     FROM interest_rate_history
     WHERE transaction_id = $1
     ORDER BY effective_from ASC`,
    [transactionId],
  );
  return result.rows.map(mapRow);
}

/**
 * Returns the currently-active (open) rate segment for a transaction, or null
 * if no interest is configured.
 *
 * @param transactionId - Parent transaction
 * @returns Active rate segment or null
 */
export async function findActiveSegment(
  transactionId: string,
): Promise<InterestRateHistory | null> {
  const result = await db.query<InterestRateHistoryRow>(
    `SELECT ${COLUMNS}
     FROM interest_rate_history
     WHERE transaction_id = $1
       AND effective_to IS NULL
     LIMIT 1`,
    [transactionId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

/**
 * Opens the first rate segment when interest is configured on a transaction.
 * effective_from is set to the transaction's own date so the full life of
 * the loan is covered.
 *
 * @param userId - Acting user (audit columns)
 * @param transactionId - Parent transaction
 * @param interestRateBps - Monthly rate in basis points
 * @param effectiveFrom - Transaction date (YYYY-MM-DD)
 * @param query - Optional query bound to an open DB transaction
 * @returns The inserted segment
 */
export async function openFirstSegment(
  userId: string,
  transactionId: string,
  interestRateBps: number,
  effectiveFrom: string,
  query: SqlQuery = db.query,
): Promise<InterestRateHistory> {
  // ON CONFLICT on the partial index handles the case where a previous failed
  // operation left an orphaned open segment — we adopt it with the new rate.
  // Note: partial indexes require the WHERE clause to be repeated exactly.
  const result = await query<InterestRateHistoryRow>(
    `INSERT INTO interest_rate_history
       (transaction_id, user_id, interest_rate_bps, effective_from, effective_to, created_by, updated_by)
     VALUES ($1, $2, $3, $4::date, NULL, $2, $2)
     ON CONFLICT (transaction_id) WHERE effective_to IS NULL
     DO UPDATE
       SET interest_rate_bps = EXCLUDED.interest_rate_bps,
           effective_from    = EXCLUDED.effective_from,
           updated_by        = $2
     RETURNING ${COLUMNS}`,
    [transactionId, userId, interestRateBps, effectiveFrom],
  );
  return mapRow(result.rows[0]!);
}

/**
 * Closes the currently-active segment and opens a new one starting today.
 * Both writes happen in one atomic DB transaction so there is never a gap
 * or overlap in the rate timeline.
 *
 * If the active segment already started today (same-day rate change) its rate
 * is updated in place instead of creating a duplicate one-day segment.
 *
 * @param userId - Acting user
 * @param transactionId - Parent transaction
 * @param newRateBps - New monthly rate in basis points
 * @param todayIso - Today's calendar date (YYYY-MM-DD)
 * @param query - Optional query bound to an open DB transaction
 * @returns The new active segment
 */
export async function rotateSegment(
  userId: string,
  transactionId: string,
  newRateBps: number,
  todayIso: string,
  query: SqlQuery = db.query,
): Promise<InterestRateHistory> {
  // Close the current active segment (set effective_to = today).
  await query(
    `UPDATE interest_rate_history
     SET effective_to = $3::date,
         updated_by   = $2
     WHERE transaction_id = $1
       AND effective_to IS NULL
       AND effective_from < $3::date`,
    [transactionId, userId, todayIso],
  );

  // If the active segment started today, update it in place instead of inserting.
  const upsertResult = await query<InterestRateHistoryRow>(
    `INSERT INTO interest_rate_history
       (transaction_id, user_id, interest_rate_bps, effective_from, effective_to, created_by, updated_by)
     VALUES ($1, $2, $3, $4::date, NULL, $2, $2)
     ON CONFLICT ON CONSTRAINT interest_rate_history_one_active_segment_unique
     DO UPDATE
       SET interest_rate_bps = EXCLUDED.interest_rate_bps,
           updated_by         = $2
     RETURNING ${COLUMNS}`,
    [transactionId, userId, newRateBps, todayIso],
  );

  return mapRow(upsertResult.rows[0]!);
}

/**
 * Closes the currently-active segment at the given date (used when interest
 * config is removed or the transaction is settled).
 *
 * @param userId - Acting user
 * @param transactionId - Parent transaction
 * @param closeDateIso - Date to set as effective_to (YYYY-MM-DD)
 * @param query - Optional query bound to an open DB transaction
 */
export async function closeActiveSegment(
  userId: string,
  transactionId: string,
  closeDateIso: string,
  query: SqlQuery = db.query,
): Promise<void> {
  await query(
    `UPDATE interest_rate_history
     SET effective_to = $3::date,
         updated_by   = $2
     WHERE transaction_id = $1
       AND effective_to IS NULL`,
    [transactionId, userId, closeDateIso],
  );
}
