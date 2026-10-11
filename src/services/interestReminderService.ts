import { env } from '../config/env.js';
import { EMAIL_JOB } from '../config/jobs.js';
import { enqueueEmail } from '../queues/emailQueue.js';
import * as interestReminderRepository from '../repositories/interestReminderRepository.js';
import * as notificationLogRepository from '../repositories/notificationLogRepository.js';
import type { InterestReminderItem } from '../types/index.js';
import { buildInterestReminderEmail } from '../utils/interestReminderEmail.js';
import { todayIsoInTimeZone } from '../utils/isoCalendar.js';
import { logger } from '../utils/logger.js';

export interface InterestReminderRunResult {
  todayIso: string;
  enqueued: number;
  skipped: number;
}

// Re-use the same notification_log table that due reminders use.
// The reminder_window column is a free-form string — we distinguish interest
// reminders from due reminders by a 'interest_period_end' prefix.
const INTEREST_REMINDER_WINDOW = 'interest_period_end' as const;

/**
 * Groups reminder items by the account (userId) that should receive the mail.
 *
 * @param items - Flat list of interest reminder items
 * @returns Map of userId → items
 */
function groupByUser(items: InterestReminderItem[]): Map<string, InterestReminderItem[]> {
  const grouped = new Map<string, InterestReminderItem[]>();
  for (const item of items) {
    const current = grouped.get(item.userId) ?? [];
    current.push(item);
    grouped.set(item.userId, current);
  }
  return grouped;
}

/**
 * Attempts to claim notification log rows for each item.
 * Only newly inserted rows are returned — already-sent items are skipped,
 * which makes the whole run idempotent.
 *
 * @param userId - Recipient
 * @param periodEndDateIso - Period-end date used as the due_date key
 * @param items - Candidate transactions
 * @returns Transaction ids that were newly claimed
 */
async function claimItems(
  userId: string,
  periodEndDateIso: string,
  items: InterestReminderItem[],
): Promise<string[]> {
  const claimed: string[] = [];
  for (const item of items) {
    const inserted = await notificationLogRepository.claimNotificationSend(
      userId,
      item.transactionId,
      INTEREST_REMINDER_WINDOW as never, // notification_log.reminder_window is typed as DueReminderWindow in the repo, but the DB column is text
      periodEndDateIso,
    );
    if (inserted) {
      claimed.push(item.transactionId);
    }
  }
  return claimed;
}

/**
 * Scans for transactions whose interest period ends today, accrues interest
 * for each, and queues one digest email per user.
 *
 * Idempotent — the notification_log unique constraint prevents double-sends
 * even if called multiple times on the same day.
 *
 * @param todayIso - Optional IST calendar date for tests; defaults to Asia/Kolkata today
 * @returns Counts of enqueued vs skipped digests
 */
export async function processInterestReminders(
  todayIso: string = todayIsoInTimeZone(),
): Promise<InterestReminderRunResult> {
  let enqueued = 0;
  let skipped = 0;

  const items = await interestReminderRepository.findDueForPeriodEnd(todayIso);

  if (items.length === 0) {
    logger.info({ todayIso }, 'Interest reminder scan: no items due today');
    return { todayIso, enqueued: 0, skipped: 0 };
  }

  const grouped = groupByUser(items);

  for (const [userId, userItems] of grouped) {
    const claimed = await claimItems(userId, todayIso, userItems);

    if (claimed.length === 0) {
      skipped += 1;
      continue;
    }

    const email = userItems[0]?.userEmail;
    if (!email) {
      await notificationLogRepository.markNotificationsFailed(
        userId,
        claimed,
        INTEREST_REMINDER_WINDOW as never,
        todayIso,
        'Recipient email is missing',
      );
      skipped += 1;
      continue;
    }

    const claimedItems = userItems.filter((item) => claimed.includes(item.transactionId));
    const content = buildInterestReminderEmail({
      items: claimedItems,
      periodEndDate: todayIso,
      frontendOrigin: env.frontendOrigin,
    });

    const jobId = `interest-reminder-${userId}-${todayIso}`;

    try {
      await enqueueEmail(
        {
          to: email,
          subject: content.subject,
          html: content.html,
          text: content.text,
        },
        EMAIL_JOB.names.interestReminder,
        jobId,
      );
      await notificationLogRepository.markNotificationsSent(
        userId,
        claimed,
        INTEREST_REMINDER_WINDOW as never,
        todayIso,
      );
      enqueued += 1;
      logger.info({ userId, count: claimed.length, todayIso }, 'Interest reminder enqueued');
    } catch (err) {
      await notificationLogRepository.markNotificationsFailed(
        userId,
        claimed,
        INTEREST_REMINDER_WINDOW as never,
        todayIso,
        err instanceof Error ? err.message : 'Failed to enqueue interest reminder',
      );
      logger.error({ err, userId, todayIso }, 'Failed to enqueue interest reminder');
    }
  }

  logger.info({ todayIso, enqueued, skipped }, 'Interest reminder scan finished');
  return { todayIso, enqueued, skipped };
}
