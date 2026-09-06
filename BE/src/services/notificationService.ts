import type { NotificationType } from '../types/index.js';
import type { EmailChannel } from './emailChannel.js';
import { getEmailChannel } from './resendEmailChannel.js';

/**
 * Dispatches a typed reminder through the configured channel.
 *
 * @param type - Reminder kind
 * @param to - Recipient email (the User, not the counterparty)
 * @param channel - Delivery strategy (defaults to Resend)
 */
export async function dispatchNotification(
  type: NotificationType,
  to: string,
  channel: EmailChannel = getEmailChannel(),
): Promise<void> {
  const subject =
    type === 'due_reminder' ? 'Upcoming repayment due' : 'Overdue transactions summary';
  const text = `Personal Money Manager notification: ${type}`;
  await channel.send({
    to,
    subject,
    text,
    html: `<p>${text}</p>`,
  });
}
