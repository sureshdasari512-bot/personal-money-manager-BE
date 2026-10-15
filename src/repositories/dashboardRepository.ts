import { db } from '../config/database.js';
import type { DashboardDueItem, DashboardPersonBalance, TransactionType } from '../types/index.js';
import { toIsoDate } from '../utils/isoDate.js';

interface TotalsRow {
  total_owed_to_user_cents: string | number;
  total_owed_to_user_principal_cents: string | number;
  total_user_owes_cents: string | number;
}

interface PersonBalanceRow {
  person_id: string;
  person_name: string;
  net_balance_cents: string | number;
  accrued_interest_cents: string | number;
  interest_period_from: Date | string | null;
  interest_period_to: Date | string | null;
}

interface DueItemRow {
  id: string;
  person_id: string;
  person_name: string;
  type: TransactionType;
  amount_cents: string | number;
  outstanding_cents: string | number;
  outstanding_principal_cents: string | number;
  accrued_interest_cents: string | number;
  transaction_date: Date | string;
  due_date: Date | string;
}

/**
 * CTE that computes per-transaction outstanding principal and unpaid accrued interest.
 *
 * outstanding_principal_cents = original amount minus the principal portion of repayments.
 * unpaid_interest_cents       = total accrued interest minus the interest portion of repayments.
 * outstanding_cents           = sum of both (the true amount still owed).
 */
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
        t.amount_cents
          - COALESCE(SUM(r.toward_principal_cents) FILTER (WHERE r.deleted_at IS NULL), 0),
        0
      ) AS outstanding_principal_cents,
      GREATEST(
        COALESCE((
          SELECT SUM(ia.accrued_interest_cents)
          FROM interest_accruals ia
          WHERE ia.transaction_id = t.id
        ), 0)
          - COALESCE(SUM(r.amount_cents - r.toward_principal_cents) FILTER (WHERE r.deleted_at IS NULL), 0),
        0
      ) AS unpaid_interest_cents
    FROM transactions t
    INNER JOIN people p ON p.id = t.person_id AND p.user_id = $1 AND p.deleted_at IS NULL
    LEFT JOIN repayments r ON r.transaction_id = t.id
    WHERE t.user_id = $1 AND t.deleted_at IS NULL AND t.status NOT IN ('paid', 'cancelled')
    GROUP BY t.id
  ),
  outstanding_with_total AS (
    SELECT
      id, person_id, type, amount_cents, transaction_date, due_date,
      outstanding_principal_cents,
      unpaid_interest_cents,
      outstanding_principal_cents + unpaid_interest_cents AS outstanding_cents
    FROM outstanding
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
    outstandingPrincipalCents: Number(row.outstanding_principal_cents),
    accruedInterestCents: Number(row.accrued_interest_cents),
    transactionDate: toIsoDate(row.transaction_date),
    dueDate: toIsoDate(row.due_date),
  };
}

/**
 * Aggregates net-position totals in SQL.
 * Outstanding includes both outstanding principal and unpaid accrued interest.
 *
 * @param userId - Authenticated user
 * @returns Totals in cents, split by principal and interest
 */
export async function getDashboardTotals(userId: string): Promise<{
  totalOwedToUserCents: number;
  totalOwedToUserPrincipalCents: number;
  totalUserOwesCents: number;
}> {
  const result = await db.query<TotalsRow>(
    `WITH ${OUTSTANDING_CTE}
     SELECT
       COALESCE(SUM(outstanding_cents)          FILTER (WHERE type = 'lend'), 0) AS total_owed_to_user_cents,
       COALESCE(SUM(outstanding_principal_cents) FILTER (WHERE type = 'lend'), 0) AS total_owed_to_user_principal_cents,
       COALESCE(SUM(outstanding_cents)          FILTER (WHERE type = 'borrow'), 0) AS total_user_owes_cents
     FROM outstanding_with_total`,
    [userId],
  );

  const row = result.rows[0];
  return {
    totalOwedToUserCents: Number(row?.total_owed_to_user_cents ?? 0),
    totalOwedToUserPrincipalCents: Number(row?.total_owed_to_user_principal_cents ?? 0),
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
           AS net_balance_cents,
         COALESCE(SUM(unpaid_interest_cents), 0) AS accrued_interest_cents
       FROM outstanding_with_total
       GROUP BY person_id
     ),
     person_interest_range AS (
       SELECT
         t.person_id,
         MIN(ia.period_start_date)                                      AS interest_period_from,
         MAX(COALESCE(ia.period_end_date, CURRENT_DATE))                AS interest_period_to
       FROM interest_accruals ia
       INNER JOIN transactions t ON t.id = ia.transaction_id AND t.user_id = $1 AND t.deleted_at IS NULL
       GROUP BY t.person_id
     )
     SELECT
       p.id   AS person_id,
       p.name AS person_name,
       n.net_balance_cents,
       n.accrued_interest_cents,
       ir.interest_period_from,
       ir.interest_period_to
     FROM person_net n
     INNER JOIN people p ON p.id = n.person_id AND p.user_id = $1 AND p.deleted_at IS NULL
     LEFT  JOIN person_interest_range ir ON ir.person_id = n.person_id
     WHERE n.net_balance_cents <> 0
     ORDER BY ABS(n.net_balance_cents) DESC, p.name ASC`,
    [userId],
  );

  return result.rows.map((row) => ({
    personId: row.person_id,
    personName: row.person_name,
    netBalanceCents: Number(row.net_balance_cents),
    accruedInterestCents: Number(row.accrued_interest_cents),
    interestPeriodFrom: row.interest_period_from ? toIsoDate(row.interest_period_from) : null,
    interestPeriodTo: row.interest_period_to ? toIsoDate(row.interest_period_to) : null,
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
       o.outstanding_cents, o.outstanding_principal_cents,
       o.unpaid_interest_cents AS accrued_interest_cents,
       o.transaction_date, o.due_date
     FROM outstanding_with_total o
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
       o.outstanding_cents, o.outstanding_principal_cents,
       o.unpaid_interest_cents AS accrued_interest_cents,
       o.transaction_date, o.due_date
     FROM outstanding_with_total o
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
