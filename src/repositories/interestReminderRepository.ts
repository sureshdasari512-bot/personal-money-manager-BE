import { db } from '../config/database.js';
import type { InterestPeriod, InterestReminderItem, TransactionType } from '../types/index.js';
import { toIsoDate } from '../utils/isoDate.js';

interface InterestReminderRow {
  transaction_id: string;
  user_id: string;
  user_email: string;
  person_id: string;
  person_name: string;
  type: TransactionType;
  amount_cents: string | number;
  outstanding_cents: string | number;
  accrued_interest_cents: string | number;
  interest_rate_bps: number;
  interest_period: InterestPeriod;
  period_end_date: Date | string;
}

/**
 * Finds all transactions whose interest period ends on a given date and have
 * an active interest config and a non-zero open accrual segment.
 *
 * Called once per day by the interest reminder scheduler. The period_end_date
 * is computed by the scheduler for each (transaction_date, period) combination.
 *
 * @param periodEndDateIso - The period-end calendar date to scan for (YYYY-MM-DD)
 * @returns Reminder items ready to be grouped by user and emailed
 */
export async function findDueForPeriodEnd(
  periodEndDateIso: string,
): Promise<InterestReminderItem[]> {
  const result = await db.query<InterestReminderRow>(
    `WITH open_accruals AS (
       SELECT
         ia.transaction_id,
         ia.accrued_interest_cents
       FROM interest_accruals ia
       WHERE ia.period_end_date IS NULL
         AND ia.accrued_interest_cents > 0
     ),
     outstanding AS (
       SELECT
         t.id,
         t.user_id,
         t.person_id,
         t.type,
         t.amount_cents,
         t.transaction_date,
         tic.interest_rate_bps,
         tic.interest_period,
         GREATEST(
           t.amount_cents
             - COALESCE(SUM(r.amount_cents) FILTER (WHERE r.deleted_at IS NULL), 0),
           0
         ) AS outstanding_cents
       FROM transactions t
       INNER JOIN transaction_interest_configs tic
               ON tic.transaction_id = t.id
              AND tic.deleted_at IS NULL
       LEFT JOIN repayments r ON r.transaction_id = t.id
       WHERE t.deleted_at IS NULL
         AND t.status NOT IN ('paid', 'cancelled')
       GROUP BY t.id, tic.interest_rate_bps, tic.interest_period
     )
     SELECT
       o.id                            AS transaction_id,
       o.user_id,
       u.email                         AS user_email,
       o.person_id,
       p.name                          AS person_name,
       o.type,
       o.amount_cents,
       o.outstanding_cents,
       oa.accrued_interest_cents,
       o.interest_rate_bps,
       o.interest_period,
       $1::date                        AS period_end_date
     FROM outstanding o
     INNER JOIN open_accruals oa    ON oa.transaction_id = o.id
     INNER JOIN users u             ON u.id = o.user_id
                                   AND u.deleted_at IS NULL
                                   AND u.is_active = true
     INNER JOIN people p            ON p.id = o.person_id
                                   AND p.user_id = o.user_id
                                   AND p.deleted_at IS NULL
     WHERE o.outstanding_cents > 0
       -- The period end date must match: transaction_date + N × period_months = today.
       -- We check this by verifying the month difference is an exact multiple of
       -- the period length (monthly=1, quarterly=3, half_yearly=6, yearly=12).
       AND (
         EXTRACT(YEAR FROM AGE($1::date, o.transaction_date::date)) * 12
         + EXTRACT(MONTH FROM AGE($1::date, o.transaction_date::date))
       )::int % CASE o.interest_period
                  WHEN 'monthly'     THEN 1
                  WHEN 'quarterly'   THEN 3
                  WHEN 'half_yearly' THEN 6
                  WHEN 'yearly'      THEN 12
                END = 0
       -- And the day-of-month must match the original transaction day.
       AND EXTRACT(DAY FROM $1::date) = EXTRACT(DAY FROM o.transaction_date::date)
     ORDER BY u.id ASC, p.name ASC`,
    [periodEndDateIso],
  );

  return result.rows.map((row) => ({
    transactionId: row.transaction_id,
    userId: row.user_id,
    userEmail: row.user_email,
    personId: row.person_id,
    personName: row.person_name,
    type: row.type,
    amountCents: Number(row.amount_cents),
    outstandingCents: Number(row.outstanding_cents),
    accruedInterestCents: Number(row.accrued_interest_cents),
    interestRateBps: Number(row.interest_rate_bps),
    interestPeriod: row.interest_period,
    periodEndDate: toIsoDate(row.period_end_date),
  }));
}
