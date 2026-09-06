import { describe, expect, it } from 'vitest';
import { paymentStatusFromOutstanding } from './transactionStatus.js';

describe('paymentStatusFromOutstanding', () => {
  it('returns pending when nothing has been repaid', () => {
    expect(paymentStatusFromOutstanding(10000, 10000)).toBe('pending');
  });

  it('returns partially_paid when some amount remains', () => {
    expect(paymentStatusFromOutstanding(10000, 4000)).toBe('partially_paid');
  });

  it('returns paid when outstanding is zero', () => {
    expect(paymentStatusFromOutstanding(10000, 0)).toBe('paid');
  });
});
