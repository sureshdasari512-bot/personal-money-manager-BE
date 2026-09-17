import { db } from '../config/database.js';
import type { DueReminderItem, TransactionType } from '../types/index.js';
import { toIsoDate } from '../utils/isoDate.js';

interface DueReminderRow {
  transaction_id: string;
  user_id: string;
  user_email: string;
  person_id: string;
  person_name: string;
  type: TransactionType;
  amount_cents: string | number;
  outstanding_cents: string | number;
  due_date: Date | string;
}

/**
 * Lists outstanding lends/borrows due on a calendar date, for every active user.
 *
 * @param dueDateIso - Due date YYYY-MM-DD (already computed in IST)
 * @returns Items with owner email for digest grouping
 */
export async function findOutstandingDueOn(dueDateIso: string): Promise<DueReminderItem[]> {
  const result = await db.query<DueReminderRow>(
    `WITH outstanding AS (
       SELECT
         t.id,
         t.user_id,
         t.person_id,
         t.type,
         t.amount_cents,
         t.due_date,
         GREATEST(
           t.amount_cents - COALESCE(SUM(r.amount_cents) FILTER (WHERE r.deleted_at IS NULL), 0),
           0
         ) AS outstanding_cents
       FROM transactions t
       LEFT JOIN repayments r ON r.transaction_id = t.id
       WHERE t.deleted_at IS NULL
         AND t.status <> 'cancelled'
         AND t.due_date = $1::date
       GROUP BY t.id
     )
     SELECT
       o.id AS transaction_id,
       o.user_id,
       u.email AS user_email,
       o.person_id,
       p.name AS person_name,
       o.type,
       o.amount_cents,
       o.outstanding_cents,
       o.due_date
     FROM outstanding o
     INNER JOIN users u ON u.id = o.user_id AND u.deleted_at IS NULL AND u.is_active = true
     INNER JOIN people p ON p.id = o.person_id AND p.user_id = o.user_id AND p.deleted_at IS NULL
     WHERE o.outstanding_cents > 0
     ORDER BY u.id ASC, o.due_date ASC, p.name ASC`,
    [dueDateIso],
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
    dueDate: toIsoDate(row.due_date),
  }));
}
