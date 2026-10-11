import { describe, expect, it } from 'vitest';
import {
  calculatePeriodInterestCents,
  calculateTotalSimpleInterestCents,
  computeCompletedPeriods,
  PERIOD_MONTHS,
} from './simpleInterest.js';

// ---------------------------------------------------------------------------
// Model: interestRateBps = MONTHLY rate (e.g. 200 = 2% per month)
//        period           = when they PAY (monthly / quarterly / half_yearly / yearly)
//        formula          = principal × (monthlyRateBps / 10000) × periodMonths
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// computeCompletedPeriods
// ---------------------------------------------------------------------------
describe('computeCompletedPeriods', () => {
  it('returns 0 when start and end are the same date', () => {
    expect(computeCompletedPeriods('2024-01-01', '2024-01-01', 'monthly')).toBe(0);
  });

  it('returns 0 when end is before start', () => {
    expect(computeCompletedPeriods('2024-06-01', '2024-01-01', 'monthly')).toBe(0);
  });

  it('monthly: 1 month elapsed = 1 period', () => {
    expect(computeCompletedPeriods('2024-01-01', '2024-02-01', 'monthly')).toBe(1);
  });

  it('monthly: 3 months elapsed = 3 periods', () => {
    expect(computeCompletedPeriods('2024-01-01', '2024-04-01', 'monthly')).toBe(3);
  });

  it('quarterly: 2 months elapsed = 0 complete quarters', () => {
    expect(computeCompletedPeriods('2024-01-01', '2024-03-01', 'quarterly')).toBe(0);
  });

  it('quarterly: 5 months elapsed = 1 complete quarter', () => {
    expect(computeCompletedPeriods('2024-01-01', '2024-06-01', 'quarterly')).toBe(1);
  });

  it('quarterly: exactly 6 months = 2 complete quarters', () => {
    expect(computeCompletedPeriods('2024-01-01', '2024-07-01', 'quarterly')).toBe(2);
  });

  it('half_yearly: 7 months = 1 complete half-year', () => {
    expect(computeCompletedPeriods('2024-01-01', '2024-08-01', 'half_yearly')).toBe(1);
  });

  it('half_yearly: exactly 12 months = 2 complete half-years', () => {
    expect(computeCompletedPeriods('2024-01-01', '2025-01-01', 'half_yearly')).toBe(2);
  });

  it('yearly: 11 months = 0 complete years', () => {
    expect(computeCompletedPeriods('2024-01-01', '2024-12-01', 'yearly')).toBe(0);
  });

  it('yearly: exactly 12 months = 1 complete year', () => {
    expect(computeCompletedPeriods('2024-01-01', '2025-01-01', 'yearly')).toBe(1);
  });

  it('spans year boundary correctly', () => {
    // Nov 2023 → Feb 2024 = 3 months
    expect(computeCompletedPeriods('2023-11-01', '2024-02-01', 'monthly')).toBe(3);
  });

  it('throws on invalid startDate', () => {
    expect(() => computeCompletedPeriods('not-a-date', '2024-01-01', 'monthly')).toThrow(
      'Invalid startDate',
    );
  });

  it('throws on invalid endDate', () => {
    expect(() => computeCompletedPeriods('2024-01-01', 'not-a-date', 'monthly')).toThrow(
      'Invalid endDate',
    );
  });
});

// ---------------------------------------------------------------------------
// calculatePeriodInterestCents
// Model: interest = principal × (monthlyRateBps / 10000) × periodMonths
// ---------------------------------------------------------------------------
describe('calculatePeriodInterestCents', () => {
  it('returns 0 when opening balance is 0', () => {
    expect(calculatePeriodInterestCents(0, 200, 'monthly')).toBe(0);
  });

  it('returns 0 when rate is 0', () => {
    expect(calculatePeriodInterestCents(500_000, 0, 'monthly')).toBe(0);
  });

  // ₹5,000 = 500,000 paise, 2%/month monthly payment
  // interest = 500000 × (200/10000) × 1 = 500000 × 0.02 × 1 = 10,000 paise = ₹100
  it('monthly: 2%/month on ₹5,000 = ₹100 per month', () => {
    expect(calculatePeriodInterestCents(500_000, 200, 'monthly')).toBe(10_000);
  });

  // ₹5,000, 2%/month, paying quarterly → 2% × 3 = 6% per quarter
  // interest = 500000 × (200/10000) × 3 = 500000 × 0.02 × 3 = 30,000 paise = ₹300
  it('quarterly: 2%/month on ₹5,000 = ₹300 per quarter', () => {
    expect(calculatePeriodInterestCents(500_000, 200, 'quarterly')).toBe(30_000);
  });

  // ₹5,000, 2%/month, paying half-yearly → 2% × 6 = 12% per half-year
  // interest = 500000 × (200/10000) × 6 = 60,000 paise = ₹600
  it('half_yearly: 2%/month on ₹5,000 = ₹600 per half-year', () => {
    expect(calculatePeriodInterestCents(500_000, 200, 'half_yearly')).toBe(60_000);
  });

  // ₹5,000, 2%/month, paying yearly → 2% × 12 = 24% per year
  // interest = 500000 × (200/10000) × 12 = 120,000 paise = ₹1,200
  it('yearly: 2%/month on ₹5,000 = ₹1,200 per year', () => {
    expect(calculatePeriodInterestCents(500_000, 200, 'yearly')).toBe(120_000);
  });

  // 1%/month on ₹10,000 monthly
  // interest = 1000000 × (100/10000) × 1 = 10,000 paise = ₹100
  it('1%/month on ₹10,000 monthly = ₹100', () => {
    expect(calculatePeriodInterestCents(1_000_000, 100, 'monthly')).toBe(10_000);
  });

  it('floors fractional paise — never rounds up', () => {
    // very small principal/rate → floors to 0
    expect(calculatePeriodInterestCents(1, 1, 'monthly')).toBe(0);
  });

  it('throws when openingBalanceCents is negative', () => {
    expect(() => calculatePeriodInterestCents(-1, 200, 'monthly')).toThrow(
      'openingBalanceCents cannot be negative',
    );
  });

  it('throws when monthlyRateBps is negative', () => {
    expect(() => calculatePeriodInterestCents(500_000, -1, 'monthly')).toThrow(
      'monthlyRateBps cannot be negative',
    );
  });
});

// ---------------------------------------------------------------------------
// calculateTotalSimpleInterestCents
// ---------------------------------------------------------------------------
describe('calculateTotalSimpleInterestCents', () => {
  it('returns 0 when no complete period has elapsed', () => {
    // 2 months elapsed, quarterly → 0 quarters complete
    expect(
      calculateTotalSimpleInterestCents(500_000, 200, 'quarterly', '2024-01-01', '2024-03-01'),
    ).toBe(0);
  });

  // 2%/month, monthly, 3 months → 3 periods × ₹100 = ₹300
  it('monthly: 2%/month on ₹5,000 for 3 months = ₹300', () => {
    expect(
      calculateTotalSimpleInterestCents(500_000, 200, 'monthly', '2024-01-01', '2024-04-01'),
    ).toBe(30_000);
  });

  // 2%/month, quarterly, 2 quarters → 2 × ₹300 = ₹600
  it('quarterly: 2%/month on ₹5,000 for 2 quarters = ₹600', () => {
    expect(
      calculateTotalSimpleInterestCents(500_000, 200, 'quarterly', '2024-01-01', '2024-07-01'),
    ).toBe(60_000);
  });

  // 2%/month, yearly, 1 year → ₹1,200
  it('yearly: 2%/month on ₹5,000 for 1 year = ₹1,200', () => {
    expect(
      calculateTotalSimpleInterestCents(500_000, 200, 'yearly', '2024-01-01', '2025-01-01'),
    ).toBe(120_000);
  });

  it('returns 0 when start equals end', () => {
    expect(
      calculateTotalSimpleInterestCents(500_000, 200, 'monthly', '2024-01-01', '2024-01-01'),
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PERIOD_MONTHS constants sanity check
// ---------------------------------------------------------------------------
describe('PERIOD_MONTHS', () => {
  it('monthly = 1 month', () => expect(PERIOD_MONTHS.monthly).toBe(1));
  it('quarterly = 3 months', () => expect(PERIOD_MONTHS.quarterly).toBe(3));
  it('half_yearly = 6 months', () => expect(PERIOD_MONTHS.half_yearly).toBe(6));
  it('yearly = 12 months', () => expect(PERIOD_MONTHS.yearly).toBe(12));
});
