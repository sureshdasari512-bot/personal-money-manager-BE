import { describe, expect, it } from 'vitest';
import { calculateNetBalance, calculateOutstandingBalance } from './balance.js';

describe('calculateOutstandingBalance', () => {
  it('returns the remaining amount after partial repayments', () => {
    expect(calculateOutstandingBalance(10000, [2500, 2500])).toBe(5000);
  });

  it('returns 0 when fully repaid', () => {
    expect(calculateOutstandingBalance(5000, [5000])).toBe(0);
  });

  it('never goes negative when repayments exceed the original amount', () => {
    expect(calculateOutstandingBalance(1000, [1500])).toBe(0);
  });

  it('throws when a repayment is negative', () => {
    expect(() => calculateOutstandingBalance(1000, [-1])).toThrow(
      'Repayment amount cannot be negative',
    );
  });
});

describe('calculateNetBalance', () => {
  it('subtracts outstanding borrows from outstanding lends', () => {
    const net = calculateNetBalance(
      [
        { id: 'a', type: 'lend' },
        { id: 'b', type: 'borrow' },
      ],
      { a: 1000, b: 400 },
    );
    expect(net).toBe(600);
  });
});
