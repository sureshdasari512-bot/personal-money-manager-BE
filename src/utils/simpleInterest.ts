/**
 * Daily-interest utilities for the 30/360 simple-interest model.
 *
 * Model rules:
 *   - Rate is always expressed as a MONTHLY rate in basis points (1 bps = 0.01 %).
 *     e.g. 200 bps = 2 %/month.
 *   - The daily rate is monthly_rate / 30 — the denominator is always 30
 *     regardless of the actual number of days in the month (February included).
 *   - Interest accumulates every calendar day from the lend date.
 *   - A rate change takes effect from its effective_from date; past segments
 *     are immutable once closed.
 */

import type { InterestPeriod } from '../types/index.js';

/**
 * Number of calendar months in one notification/payment period.
 * Used only for deciding when to send the periodic interest email —
 * not for interest calculation itself (which is daily).
 */
export const PERIOD_MONTHS: Record<InterestPeriod, number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
};

/**
 * Calculates the daily interest in cents for a given principal and monthly rate.
 * The result is floored — we never overstate what is owed.
 *
 * Formula: floor( principal × monthly_rate_bps / 10000 / 30 )
 *
 * The denominator is always 30 (30/360 convention). February and 31-day months
 * use the same divisor so the daily rate is constant within a segment.
 *
 * @param openingBalanceCents - Outstanding principal in cents (must be >= 0)
 * @param monthlyRateBps - Monthly rate in basis points, e.g. 200 = 2 %/month
 * @returns Daily interest in cents, floored to the nearest whole cent
 * @throws {Error} If either argument is negative
 */
export function calculateDailyInterestCents(
  openingBalanceCents: number,
  monthlyRateBps: number,
): number {
  if (openingBalanceCents < 0) {
    throw new Error('openingBalanceCents cannot be negative');
  }
  if (monthlyRateBps < 0) {
    throw new Error('monthlyRateBps cannot be negative');
  }
  if (openingBalanceCents === 0 || monthlyRateBps === 0) {
    return 0;
  }
  // Multiply before dividing to keep integer precision as long as possible.
  return Math.floor((openingBalanceCents * monthlyRateBps) / 10_000 / 30);
}

/**
 * Calculates the total interest for a segment of a given number of days.
 *
 * Formula: daily_interest_cents × days
 *
 * @param dailyInterestCents - Pre-computed daily interest for the segment
 * @param days - Number of calendar days the segment covers (>= 0)
 * @returns Total interest in cents for the segment
 * @throws {Error} If days is negative
 */
export function calculateSegmentInterestCents(
  dailyInterestCents: number,
  days: number,
): number {
  if (days < 0) {
    throw new Error('days cannot be negative');
  }
  return dailyInterestCents * days;
}

/**
 * Counts the number of calendar days between two ISO dates.
 * start is inclusive, end is exclusive — matching period_start_date /
 * period_end_date semantics in the DB.
 *
 * e.g. daysBetween('2026-09-05', '2026-09-09') = 4
 *      (days: Sep 5, Sep 6, Sep 7, Sep 8 — Sep 9 is not counted)
 *
 * @param startIso - Inclusive start date (YYYY-MM-DD)
 * @param endIso - Exclusive end date (YYYY-MM-DD)
 * @returns Number of days (0 when start === end, negative when end < start)
 */
export function daysBetween(startIso: string, endIso: string): number {
  const startMs = Date.UTC(
    Number(startIso.slice(0, 4)),
    Number(startIso.slice(5, 7)) - 1,
    Number(startIso.slice(8, 10)),
  );
  const endMs = Date.UTC(
    Number(endIso.slice(0, 4)),
    Number(endIso.slice(5, 7)) - 1,
    Number(endIso.slice(8, 10)),
  );
  return Math.round((endMs - startMs) / 86_400_000);
}

/**
 * Returns the next interest-period notification date after startDate.
 * Used to determine when to send the periodic interest email.
 *
 * e.g. lend date 2026-09-05, monthly → next notification 2026-10-05
 *      lend date 2026-09-05, quarterly → next notification 2026-12-05
 *
 * @param transactionDate - Original lend/borrow date (YYYY-MM-DD)
 * @param period - Notification frequency
 * @param afterIso - Find the first notification date strictly after this date
 * @returns Next notification date as YYYY-MM-DD
 */
export function nextPeriodEndDate(
  transactionDate: string,
  period: InterestPeriod,
  afterIso: string,
): string {
  const [sy, sm, sd] = transactionDate.split('-').map(Number) as [number, number, number];
  const [ay, am, ad] = afterIso.split('-').map(Number) as [number, number, number];

  const monthsElapsed =
    (ay - sy) * 12 + (am - sm) + (ad >= sd ? 0 : -1);

  const periodMonths = PERIOD_MONTHS[period];
  const periodsCompleted = Math.floor(monthsElapsed / periodMonths);
  const nextPeriodStart = (periodsCompleted + 1) * periodMonths;

  const targetMonth = sm - 1 + nextPeriodStart; // 0-based month offset
  const targetYear = sy + Math.floor(targetMonth / 12);
  const targetMonthOfYear = targetMonth % 12;

  const result = new Date(Date.UTC(targetYear, targetMonthOfYear, sd));
  return result.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Legacy exports — kept so existing callers compile while they are migrated.
// These will be removed once all callers use the daily model above.
// ---------------------------------------------------------------------------

/**
 * @deprecated Use calculateDailyInterestCents × days instead.
 */
export function calculatePeriodInterestCents(
  openingBalanceCents: number,
  monthlyRateBps: number,
  period: InterestPeriod,
): number {
  const months = PERIOD_MONTHS[period];
  if (openingBalanceCents < 0) throw new Error('openingBalanceCents cannot be negative');
  if (monthlyRateBps < 0) throw new Error('monthlyRateBps cannot be negative');
  if (openingBalanceCents === 0 || monthlyRateBps === 0) return 0;
  return Math.floor((openingBalanceCents * monthlyRateBps * months) / 10_000);
}

/**
 * @deprecated Use segment-based accrual service instead.
 */
export function computeCompletedPeriods(
  startDate: string,
  endDate: string,
  period: InterestPeriod,
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime())) throw new Error(`Invalid startDate: "${startDate}"`);
  if (Number.isNaN(end.getTime())) throw new Error(`Invalid endDate: "${endDate}"`);
  const monthsElapsed =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  if (monthsElapsed <= 0) return 0;
  return Math.floor(monthsElapsed / PERIOD_MONTHS[period]);
}

/**
 * @deprecated Use segment-based accrual service instead.
 */
export function calculateTotalSimpleInterestCents(
  openingBalanceCents: number,
  monthlyRateBps: number,
  period: InterestPeriod,
  startDate: string,
  endDate: string,
): number {
  const completedPeriods = computeCompletedPeriods(startDate, endDate, period);
  if (completedPeriods === 0) return 0;
  return calculatePeriodInterestCents(openingBalanceCents, monthlyRateBps, period) * completedPeriods;
}
