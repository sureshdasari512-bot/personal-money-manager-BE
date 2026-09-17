import { db } from '../config/database.js';
import type { DueReminderWindow } from '../types/index.js';

/**
 * Claims a reminder send. Returns true only when this process inserted the row.
 *
 * @param userId - Account that will receive the mail
 * @param transactionId - Outstanding transaction
 * @param window - T-2, T-1, or due day
 * @param dueDateIso - Due date snapshot YYYY-MM-DD
 * @returns Whether the send is newly claimed
 */
export async function claimNotificationSend(
  userId: string,
  transactionId: string,
  window: DueReminderWindow,
  dueDateIso: string,
): Promise<boolean> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO notification_log (user_id, transaction_id, reminder_window, due_date, status)
     VALUES ($1, $2, $3, $4::date, 'pending')
     ON CONFLICT (user_id, transaction_id, reminder_window, due_date)
     DO UPDATE SET
       status = 'pending',
       last_error = NULL
     WHERE notification_log.status = 'failed'
     RETURNING id`,
    [userId, transactionId, window, dueDateIso],
  );
  return result.rows.length > 0;
}

/**
 * Marks claimed rows as sent after the digest is queued.
 *
 * @param userId - Recipient
 * @param transactionIds - Claimed transaction ids
 * @param window - Reminder window
 * @param dueDateIso - Due date snapshot
 */
export async function markNotificationsSent(
  userId: string,
  transactionIds: string[],
  window: DueReminderWindow,
  dueDateIso: string,
): Promise<void> {
  if (transactionIds.length === 0) {
    return;
  }
  await db.query(
    `UPDATE notification_log
     SET status = 'sent',
         sent_at = NOW(),
         last_error = NULL
     WHERE user_id = $1
       AND reminder_window = $2
       AND due_date = $3::date
       AND transaction_id = ANY($4::uuid[])
       AND status = 'pending'`,
    [userId, window, dueDateIso, transactionIds],
  );
}

/**
 * Records why a claimed send could not be queued, so the next run can retry.
 *
 * @param userId - Recipient
 * @param transactionIds - Claimed transaction ids
 * @param window - Reminder window
 * @param dueDateIso - Due date snapshot
 * @param reason - Client-safe failure text (no secrets)
 */
export async function markNotificationsFailed(
  userId: string,
  transactionIds: string[],
  window: DueReminderWindow,
  dueDateIso: string,
  reason: string,
): Promise<void> {
  if (transactionIds.length === 0) {
    return;
  }
  await db.query(
    `UPDATE notification_log
     SET status = 'failed',
         last_error = $5
     WHERE user_id = $1
       AND reminder_window = $2
       AND due_date = $3::date
       AND transaction_id = ANY($4::uuid[])
       AND status = 'pending'`,
    [userId, window, dueDateIso, transactionIds, reason.slice(0, 500)],
  );
}
