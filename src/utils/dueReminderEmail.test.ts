import { describe, expect, it } from 'vitest';
import type { DueReminderItem } from '../types/index.js';
import { buildDueReminderEmail } from './dueReminderEmail.js';

function sampleItem(overrides: Partial<DueReminderItem> = {}): DueReminderItem {
  return {
    transactionId: 'txn-1',
    userId: 'user-1',
    userEmail: 'owner@example.com',
    personId: 'person-1',
    personName: 'Ravi',
    type: 'lend',
    amountCents: 50000,
    outstandingCents: 20000,
    dueDate: '2026-09-20',
    ...overrides,
  };
}

describe('buildDueReminderEmail', () => {
  it('uses a due-in-2-days headline and links to the dashboard', () => {
    const email = buildDueReminderEmail({
      window: 'due_minus_2',
      frontendOrigin: 'https://app.example.com/',
      items: [sampleItem()],
    });
    expect(email.subject).toContain('Due in 2 days');
    expect(email.text).toContain('They owe you');
    expect(email.text).toContain('https://app.example.com/dashboard');
    expect(email.html).toContain('https://app.example.com/people/person-1');
    expect(email.html).toContain('Open dashboard');
  });

  it('labels borrow items as money the user owes', () => {
    const email = buildDueReminderEmail({
      window: 'due_today',
      frontendOrigin: 'http://localhost:5173',
      items: [sampleItem({ type: 'borrow', personName: 'Anu' })],
    });
    expect(email.subject).toContain('Due today');
    expect(email.text).toContain('You owe them');
    expect(email.html).toContain('Anu');
  });
});
