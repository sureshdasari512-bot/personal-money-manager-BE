import { db } from '../config/database.js';
import type { DashboardSummary } from '../types/index.js';

interface DashboardRow {
  total_owed_to_user_cents: string | number;
  total_user_owes_cents: string | number;
  overdue_count: string | number;
  upcoming_due_count: string | number;
}

/**
 * Aggregates dashboard totals in SQL rather than looping in the application.
 * Outstanding is amount minus the sum of active repayments.
 *
 * @param userId - Authenticated user
 * @returns Dashboard summary in cents
 */
export async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
  const result = await db.query<DashboardRow>(
    `WITH outstanding AS (
       SELECT
         t.type,
         t.due_date,
         t.amount_cents - COALESCE(SUM(r.amount_cents) FILTER (WHERE r.deleted_at IS NULL), 0)
           AS outstanding_cents
       FROM transactions t
       LEFT JOIN repayments r ON r.transaction_id = t.id
       WHERE t.user_id = $1 AND t.deleted_at IS NULL
       GROUP BY t.id
     )
     SELECT
       COALESCE(SUM(outstanding_cents) FILTER (WHERE type = 'lend'), 0) AS total_owed_to_user_cents,
       COALESCE(SUM(outstanding_cents) FILTER (WHERE type = 'borrow'), 0) AS total_user_owes_cents,
       COUNT(*) FILTER (
         WHERE due_date IS NOT NULL
           AND due_date < CURRENT_DATE
           AND outstanding_cents > 0
       ) AS overdue_count,
       COUNT(*) FILTER (
         WHERE due_date IS NOT NULL
           AND due_date >= CURRENT_DATE
           AND due_date <= CURRENT_DATE + INTERVAL '7 days'
           AND outstanding_cents > 0
       ) AS upcoming_due_count
     FROM outstanding`,
    [userId],
  );

  const row = result.rows[0];
  return {
    totalOwedToUserCents: Number(row?.total_owed_to_user_cents ?? 0),
    totalUserOwesCents: Number(row?.total_user_owes_cents ?? 0),
    overdueCount: Number(row?.overdue_count ?? 0),
    upcomingDueCount: Number(row?.upcoming_due_count ?? 0),
  };
}
