import { env } from '../config/env.js';
import { enqueueEmail } from '../queues/emailQueue.js';
import * as dueReminderRepository from '../repositories/dueReminderRepository.js';
import * as notificationLogRepository from '../repositories/notificationLogRepository.js';
import type { DueReminderItem, DueReminderWindow } from '../types/index.js';
import { buildDueReminderEmail } from '../utils/dueReminderEmail.js';
import { DUE_REMINDER_WINDOWS } from '../utils/dueReminderWindows.js';
import { addIsoDays, todayIsoInTimeZone } from '../utils/isoCalendar.js';
import { logger } from '../utils/logger.js';

export interface DueReminderRunResult {
  todayIso: string;
  enqueued: number;
  skipped: number;
}

/**
 * Scans T-2, T-1, and due-day outstanding items and queues one digest per user per window.
 *
 * @param todayIso - Optional IST calendar date for tests; defaults to Asia/Kolkata today
 * @returns Counts of queued vs skipped digests
 */
export async function processDueReminders(todayIso: string = todayIsoInTimeZone()): Promise<DueReminderRunResult> {
  let enqueued = 0;
  let skipped = 0;

  for (const spec of DUE_REMINDER_WINDOWS) {
    const dueDateIso = addIsoDays(todayIso, spec.offsetDays);
    const items = await dueReminderRepository.findOutstandingDueOn(dueDateIso);
    const grouped = groupByUser(items);

    for (const [userId, userItems] of grouped) {
      const claimed = await claimItems(userId, spec.window, dueDateIso, userItems);
      if (claimed.length === 0) {
        skipped += 1;
        continue;
      }

      const email = userItems[0]?.userEmail;
      if (!email) {
        await notificationLogRepository.markNotificationsFailed(
          userId,
          claimed,
          spec.window,
          dueDateIso,
          'Recipient email is missing',
        );
        skipped += 1;
        continue;
      }

      const content = buildDueReminderEmail({
        window: spec.window,
        items: userItems.filter((item) => claimed.includes(item.transactionId)),
        frontendOrigin: env.frontendOrigin,
      });
      const jobId = `due-${spec.window}-${userId}-${dueDateIso}`;

      try {
        await enqueueEmail(
          {
            to: email,
            subject: content.subject,
            html: content.html,
            text: content.text,
          },
          jobId,
        );
        await notificationLogRepository.markNotificationsSent(userId, claimed, spec.window, dueDateIso);
        enqueued += 1;
      } catch (err) {
        await notificationLogRepository.markNotificationsFailed(
          userId,
          claimed,
          spec.window,
          dueDateIso,
          err instanceof Error ? err.message : 'Failed to enqueue due reminder',
        );
        logger.error({ err, userId, window: spec.window, dueDateIso }, 'Failed to enqueue due reminder');
      }
    }
  }

  logger.info({ todayIso, enqueued, skipped }, 'Due reminder scan finished');
  return { todayIso, enqueued, skipped };
}

/**
 * Groups reminder rows by the account that should receive the mail.
 *
 * @param items - Outstanding due items
 * @returns Map of user id to their items
 */
function groupByUser(items: DueReminderItem[]): Map<string, DueReminderItem[]> {
  const grouped = new Map<string, DueReminderItem[]>();
  for (const item of items) {
    const current = grouped.get(item.userId) ?? [];
    current.push(item);
    grouped.set(item.userId, current);
  }
  return grouped;
}

/**
 * Inserts pending log rows; only newly inserted ids are returned.
 *
 * @param userId - Recipient
 * @param window - Reminder window
 * @param dueDateIso - Due date
 * @param items - Candidate transactions
 * @returns Newly claimed transaction ids
 */
async function claimItems(
  userId: string,
  window: DueReminderWindow,
  dueDateIso: string,
  items: DueReminderItem[],
): Promise<string[]> {
  const claimed: string[] = [];
  for (const item of items) {
    const inserted = await notificationLogRepository.claimNotificationSend(
      userId,
      item.transactionId,
      window,
      dueDateIso,
    );
    if (inserted) {
      claimed.push(item.transactionId);
    }
  }
  return claimed;
}
