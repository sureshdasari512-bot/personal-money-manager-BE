import type { DueReminderWindow } from '../types/index.js';

export interface DueReminderWindowSpec {
  window: DueReminderWindow;
  offsetDays: number;
  headline: string;
  preview: string;
}

/**
 * The three due-date reminder windows: 2 days before, 1 day before, and due day.
 */
export const DUE_REMINDER_WINDOWS: readonly DueReminderWindowSpec[] = [
  {
    window: 'due_minus_2',
    offsetDays: 2,
    headline: 'Due in 2 days',
    preview: 'These repayments are due in two days. Review them while there is still time.',
  },
  {
    window: 'due_minus_1',
    offsetDays: 1,
    headline: 'Due tomorrow',
    preview: 'These repayments are due tomorrow. Open the ledger if you need to record a payment.',
  },
  {
    window: 'due_today',
    offsetDays: 0,
    headline: 'Due today',
    preview: 'These repayments are due today. Record a payment or follow up now.',
  },
] as const;
