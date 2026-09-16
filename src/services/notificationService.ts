import type { NotificationType } from '../types/index.js';
import { enqueueEmail } from '../queues/emailQueue.js';

/**
 * Queues a typed reminder for the configured EmailChannel worker.
 *
 * @param type - Reminder kind
 * @param to - Recipient email (the User, not the counterparty)
 */
export async function dispatchNotification(type: NotificationType, to: string): Promise<void> {
  const subject =
    type === 'due_reminder' ? 'Upcoming repayment due' : 'Overdue transactions summary';
  const text = `Personal Money Manager notification: ${type}`;
  await enqueueEmail({
    to,
    subject,
    text,
    html: `<p>${text}</p>`,
  });
}
