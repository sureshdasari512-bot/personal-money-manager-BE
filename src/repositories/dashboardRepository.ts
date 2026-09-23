import { db } from '../config/database.js';
import type { DashboardDueItem, DashboardPersonBalance, TransactionType } from '../types/index.js';
import { toIsoDate } from '../utils/isoDate.js';

interface TotalsRow {
  total_owed_to_user_cents: string | number;
  total_user_owes_cents: string | number;
}

interface PersonBalanceRow {
  person_id: string;
  person_name: string;
  net_balance_cents: string | number;
}

interface DueItemRow {
  id: string;
  person_id: string;
  person_name: string;
  type: TransactionType;
  amount_cents: string | number;
  outstanding_cents: string | number;
  transaction_date: Date | string;
  due_date: Date | string;
}

const OUTSTANDING_CTE = `
  outstanding AS (
    SELECT
      t.id,
      t.person_id,
      t.type,
      t.amount_cents,
      t.transaction_date,
      t.due_date,
      GREATEST(
        t.amount_cents - COALESCE(SUM(r.amount_cents) FILTER (WHERE r.deleted_at IS NULL), 0),
        0
      ) AS outstanding_cents
    FROM transactions t
    INNER JOIN people p ON p.id = t.person_id AND p.user_id = $1 AND p.deleted_at IS NULL
    LEFT JOIN repayments r ON r.transaction_id = t.id
    WHERE t.user_id = $1 AND t.deleted_at IS NULL
    GROUP BY t.id
  )
`;

/**
 * Maps a due-item SQL row to the dashboard domain type.
 *
 * @param row - Raw snake_case row
 * @returns CamelCase due item
 */
function mapDueItem(row: DueItemRow): DashboardDueItem {
  return {
    transactionId: row.id,
    personId: row.person_id,
    personName: row.person_name,
    type: row.type,
    amountCents: Number(row.amount_cents),
    outstandingCents: Number(row.outstanding_cents),
    transactionDate: toIsoDate(row.transaction_date),
    dueDate: toIsoDate(row.due_date),
  };
}

/**
 * Aggregates net-position totals in SQL.
 * Outstanding is amount minus active repayments, never below zero.
 *
 * @param userId - Authenticated user
 * @returns Totals in cents
 */
export async function getDashboardTotals(
  userId: string,
): Promise<{ totalOwedToUserCents: number; totalUserOwesCents: number }> {
  const result = await db.query<TotalsRow>(
    `WITH ${OUTSTANDING_CTE}
     SELECT
       COALESCE(SUM(outstanding_cents) FILTER (WHERE type = 'lend'), 0) AS total_owed_to_user_cents,
       COALESCE(SUM(outstanding_cents) FILTER (WHERE type = 'borrow'), 0) AS total_user_owes_cents
     FROM outstanding`,
    [userId],
  );

  const row = result.rows[0];
  return {
    totalOwedToUserCents: Number(row?.total_owed_to_user_cents ?? 0),
    totalUserOwesCents: Number(row?.total_user_owes_cents ?? 0),
  };
}

/**
 * Lists people with a non-zero net balance, largest absolute amount first.
 *
 * @param userId - Authenticated user
 * @returns People and signed net balances in cents
 */
export async function findPeopleWithBalance(userId: string): Promise<DashboardPersonBalance[]> {
  const result = await db.query<PersonBalanceRow>(
    `WITH ${OUTSTANDING_CTE},
     person_net AS (
       SELECT
         person_id,
         COALESCE(SUM(outstanding_cents) FILTER (WHERE type = 'lend'), 0)
           - COALESCE(SUM(outstanding_cents) FILTER (WHERE type = 'borrow'), 0)
           AS net_balance_cents
       FROM outstanding
       GROUP BY person_id
     )
     SELECT p.id AS person_id, p.name AS person_name, n.net_balance_cents
     FROM person_net n
     INNER JOIN people p ON p.id = n.person_id AND p.user_id = $1 AND p.deleted_at IS NULL
     WHERE n.net_balance_cents <> 0
     ORDER BY ABS(n.net_balance_cents) DESC, p.name ASC`,
    [userId],
  );

  return result.rows.map((row) => ({
    personId: row.person_id,
    personName: row.person_name,
    netBalanceCents: Number(row.net_balance_cents),
  }));
}

/**
 * Lists outstanding loans/borrows whose due date is before today.
 *
 * @param userId - Authenticated user
 * @returns Overdue items, oldest due date first
 */
export async function findOverdueItems(userId: string): Promise<DashboardDueItem[]> {
  const result = await db.query<DueItemRow>(
    `WITH ${OUTSTANDING_CTE}
     SELECT
       o.id, o.person_id, p.name AS person_name, o.type, o.amount_cents,
       o.outstanding_cents, o.transaction_date, o.due_date
     FROM outstanding o
     INNER JOIN people p ON p.id = o.person_id AND p.user_id = $1 AND p.deleted_at IS NULL
     WHERE o.due_date IS NOT NULL
       AND o.due_date < CURRENT_DATE
       AND o.outstanding_cents > 0
     ORDER BY o.due_date ASC, o.transaction_date ASC`,
    [userId],
  );
  return result.rows.map(mapDueItem);
}

/**
 * Lists outstanding loans/borrows due today through the next 7 days.
 *
 * @param userId - Authenticated user
 * @returns Upcoming due items, soonest first
 */
export async function findUpcomingDueItems(userId: string): Promise<DashboardDueItem[]> {
  const result = await db.query<DueItemRow>(
    `WITH ${OUTSTANDING_CTE}
     SELECT
       o.id, o.person_id, p.name AS person_name, o.type, o.amount_cents,
       o.outstanding_cents, o.transaction_date, o.due_date
     FROM outstanding o
     INNER JOIN people p ON p.id = o.person_id AND p.user_id = $1 AND p.deleted_at IS NULL
     WHERE o.due_date IS NOT NULL
       AND o.due_date >= CURRENT_DATE
       AND o.due_date <= CURRENT_DATE + INTERVAL '7 days'
       AND o.outstanding_cents > 0
     ORDER BY o.due_date ASC, o.transaction_date ASC`,
    [userId],
  );
  return result.rows.map(mapDueItem);
}
