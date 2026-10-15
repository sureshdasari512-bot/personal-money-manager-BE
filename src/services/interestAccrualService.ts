import { db } from '../config/database.js';
import * as interestAccrualRepository from '../repositories/interestAccrualRepository.js';
import * as interestConfigRepository from '../repositories/interestConfigRepository.js';
import * as interestRateHistoryRepository from '../repositories/interestRateHistoryRepository.js';
import * as repaymentRepository from '../repositories/repaymentRepository.js';
import * as transactionRepository from '../repositories/transactionRepository.js';
import type {
  InterestAccrual,
  InterestPeriod,
  Repayment,
  TransactionInterestConfig,
} from '../types/index.js';
import { AppError } from '../types/index.js';
import {
  calculateDailyInterestCents,
  calculateSegmentInterestCents,
  daysBetween,
} from '../utils/simpleInterest.js';
import { todayIsoInTimeZone } from '../utils/isoCalendar.js';
import { isPgError, mapPgError } from '../utils/pgError.js';

// Constraint → human-readable message map for every constraint in
// interest_accruals and interest_rate_history that a service call can hit.
const INTEREST_CONSTRAINT_MESSAGES: Record<string, string> = {
  idx_interest_accruals_transaction_start_unique:
    'An interest segment for this transaction and date already exists.',
  idx_interest_accruals_open_segment_unique:
    'This transaction already has an open interest segment.',
  idx_interest_rate_history_active_segment:
    'This transaction already has an active interest rate.',
  interest_rate_history_one_active_segment_unique:
    'This transaction already has an active interest rate.',
  interest_accruals_opening_balance_positive:
    'Opening balance must be greater than zero.',
  interest_accruals_days_count_non_negative:
    'Day count cannot be negative.',
  interest_rate_history_rate_non_negative:
    'Interest rate cannot be negative.',
  interest_rate_history_rate_max:
    'Interest rate cannot exceed 1000% per month.',
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Outstanding principal = lent amount minus principal portions of repayments paid strictly before a date. */
function outstandingOnDate(
  amountCents: number,
  repayments: Repayment[],
  beforeDateIso: string,
): number {
  const totalRepaid = repayments
    .filter((r) => r.paidOn < beforeDateIso)
    .reduce((sum, r) => sum + r.towardPrincipalCents, 0);
  return Math.max(amountCents - totalRepaid, 0);
}

/**
 * Determines the accrual end date for a transaction.
 * Settled / cancelled transactions stop accruing on the last repayment date;
 * active ones accrue up to and including today.
 *
 * @param status - Transaction status
 * @param repayments - All repayments on the transaction
 * @param transactionDate - Fallback if no repayments exist
 * @param todayIso - Today's calendar date (IST)
 * @returns Exclusive end date for the accrual window
 */
function accrualEndDate(
  status: string,
  repayments: Repayment[],
  transactionDate: string,
  todayIso: string,
): string {
  if (status === 'paid' || status === 'cancelled') {
    const latestRepayment = repayments.reduce<string | null>(
      (latest, r) => (latest === null || r.paidOn > latest ? r.paidOn : latest),
      null,
    );
    // period_end_date is exclusive, so add 1 day to the last repayment date
    // so the repayment day itself is included in the interest calculation.
    const base = latestRepayment ?? transactionDate;
    const [y, m, d] = base.split('-').map(Number) as [number, number, number];
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  }
  // Active transactions: exclusive end = tomorrow so today is included.
  const [y, m, d] = todayIso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Public service functions
// ---------------------------------------------------------------------------

/**
 * Computes and persists daily interest for a single transaction using the
 * segment model.  Safe to call multiple times — idempotent.
 *
 * Flow:
 *  1. Load config, transaction, repayments, rate history, and open segment.
 *  2. For each rate segment in interest_rate_history that overlaps the
 *     uncovered window, compute interest and upsert the accrual segment.
 *  3. The currently-open accrual segment is refreshed in-place on every run.
 *
 * @param userId - Acting user (audit columns)
 * @param transactionId - Transaction to accrue interest for
 * @returns All accrual segments after the run (existing + new)
 * @throws {AppError} If the transaction does not exist or does not belong to the user
 */
export async function accrueInterestForTransaction(
  userId: string,
  transactionId: string,
): Promise<InterestAccrual[]> {
  const [config, transaction] = await Promise.all([
    interestConfigRepository.findByTransactionId(transactionId),
    transactionRepository.findTransactionById(userId, transactionId),
  ]);

  if (!config || !transaction) {
    return [];
  }

  const [repayments, rateHistory] = await Promise.all([
    repaymentRepository.findRepaymentsByTransaction(transactionId),
    interestRateHistoryRepository.findByTransactionId(transactionId),
  ]);

  if (rateHistory.length === 0) {
    return [];
  }

  const todayIso = todayIsoInTimeZone();
  const endDate = accrualEndDate(
    transaction.status,
    repayments,
    transaction.transactionDate,
    todayIso,
  );

  // Determine the start of the uncovered window (day after the last closed segment).
  const existingSegments = await interestAccrualRepository.findByTransactionId(transactionId);
  const lastClosedSegment = [...existingSegments]
    .filter((s) => s.periodEndDate !== null)
    .sort((a, b) => b.periodStartDate.localeCompare(a.periodStartDate))[0];

  const coveredUpTo = lastClosedSegment?.periodEndDate ?? transaction.transactionDate;

  try {
  await db.withTransaction(async (query) => {
    for (const rateSeg of rateHistory) {
      // Rate segment window: [rateSeg.effectiveFrom, rateSeg.effectiveTo ?? endDate)
      const rateStart = rateSeg.effectiveFrom;
      const rateEnd = rateSeg.effectiveTo ?? endDate;

      // Accrual window for this rate segment = intersection with uncovered window.
      const segStart = rateStart > coveredUpTo ? rateStart : coveredUpTo;
      const segEnd = rateEnd < endDate ? rateEnd : endDate;

      if (segStart >= segEnd) {
        // This segment is already fully covered or falls after the end date.
        continue;
      }

      const openingBalance = outstandingOnDate(
        transaction.amountCents,
        repayments,
        segStart,
      );

      if (openingBalance === 0) {
        continue;
      }

      const dailyInterest = calculateDailyInterestCents(
        openingBalance,
        rateSeg.interestRateBps,
      );

      const isLastRateSegment = rateSeg.effectiveTo === null;
      const isOpenWindow = isLastRateSegment && segEnd === endDate;

      if (isOpenWindow) {
        // This is the currently-accruing segment — upsert (refresh or create).
        const days = daysBetween(segStart, segEnd);
        const totalInterest = calculateSegmentInterestCents(dailyInterest, days);
        const openSegment = await interestAccrualRepository.findOpenSegment(transactionId);

        if (openSegment) {
          await interestAccrualRepository.updateOpenSegment(
            userId,
            transactionId,
            { daysCount: days, accruedInterestCents: totalInterest },
            query,
          );
        } else {
          await interestAccrualRepository.createOpenSegment(
            userId,
            {
              transactionId,
              periodStartDate: segStart,
              openingBalanceCents: openingBalance,
              interestRateBps: rateSeg.interestRateBps,
              daysCount: days,
              dailyInterestCents: dailyInterest,
              accruedInterestCents: totalInterest,
            },
            query,
          );
        }
      } else {
        // This is a closed historical segment — insert it (idempotent via unique index).
        const days = daysBetween(segStart, segEnd);
        const totalInterest = calculateSegmentInterestCents(dailyInterest, days);
        await interestAccrualRepository.createOpenSegment(
          userId,
          {
            transactionId,
            periodStartDate: segStart,
            openingBalanceCents: openingBalance,
            interestRateBps: rateSeg.interestRateBps,
            daysCount: days,
            dailyInterestCents: dailyInterest,
            accruedInterestCents: totalInterest,
          },
          query,
        );
        // Then immediately close it.
        await interestAccrualRepository.closeOpenSegment(
          userId,
          transactionId,
          segEnd,
          days,
          totalInterest,
          query,
        );
      }
    }
  });

  return interestAccrualRepository.findByTransactionId(transactionId);
  } catch (err) {
    if (isPgError(err)) throw mapPgError(err, INTEREST_CONSTRAINT_MESSAGES);
    throw err;
  }
}

/**
 * Creates or updates the interest config for a transaction, writes a rate
 * history segment, and immediately accrues any already-elapsed interest.
 *
 * On first configure: opens the rate history at the transaction date.
 * On rate change: closes the current history segment and opens a new one
 * from today, then closes the open accrual segment and starts a fresh one.
 *
 * @param userId - Acting user
 * @param transactionId - Target transaction
 * @param interestRateBps - New monthly rate in basis points
 * @param interestPeriod - Notification/payment frequency
 * @returns The upserted interest config
 * @throws {AppError} 404 if the transaction does not exist
 */
export async function upsertInterestConfig(
  userId: string,
  transactionId: string,
  interestRateBps: number,
  interestPeriod: InterestPeriod,
): Promise<TransactionInterestConfig> {
  const transaction = await transactionRepository.findTransactionById(userId, transactionId);
  if (!transaction) {
    throw new AppError('Transaction not found', 404);
  }

  if (transaction.status === 'paid' || transaction.status === 'cancelled') {
    throw new AppError('Interest cannot be added or changed on a settled transaction', 400);
  }

  const todayIso = todayIsoInTimeZone();

  let config: TransactionInterestConfig;

  try {
  await db.withTransaction(async (query) => {
    const existing = await interestConfigRepository.findByTransactionId(transactionId);

    if (existing) {
      // Update the config record (period may change independently of rate).
      const updated = await interestConfigRepository.updateInterestConfig(
        userId,
        transactionId,
        { interestRateBps, interestPeriod },
        query,
      );
      if (!updated) {
        throw new AppError('Interest config not found', 404);
      }
      config = updated;

      const activeRateSeg = await interestRateHistoryRepository.findActiveSegment(transactionId);
      const rateChanged = activeRateSeg?.interestRateBps !== interestRateBps;

      if (rateChanged) {
        // 1. Close the open accrual segment at today (exclusive).
        const repayments = await repaymentRepository.findRepaymentsByTransaction(transactionId);
        const openSeg = await interestAccrualRepository.findOpenSegment(transactionId);

        if (openSeg) {
          const days = daysBetween(openSeg.periodStartDate, todayIso);
          const totalInterest = calculateSegmentInterestCents(
            openSeg.dailyInterestCents,
            days,
          );
          await interestAccrualRepository.closeOpenSegment(
            userId,
            transactionId,
            todayIso,
            days,
            totalInterest,
            query,
          );
        }

        // 2. Rotate the rate history segment.
        await interestRateHistoryRepository.rotateSegment(
          userId,
          transactionId,
          interestRateBps,
          todayIso,
          query,
        );

        // 3. Open a new accrual segment from today with the new rate.
        const openingBalance = outstandingOnDate(
          transaction.amountCents,
          repayments,
          todayIso,
        );

        if (openingBalance > 0) {
          const dailyInterest = calculateDailyInterestCents(openingBalance, interestRateBps);
          await interestAccrualRepository.createOpenSegment(
            userId,
            {
              transactionId,
              periodStartDate: todayIso,
              openingBalanceCents: openingBalance,
              interestRateBps,
              daysCount: 0,
              dailyInterestCents: dailyInterest,
              accruedInterestCents: 0,
            },
            query,
          );
        }
      }
    } else {
      // First time interest is configured on this transaction.
      config = await interestConfigRepository.createInterestConfig(
        userId,
        transactionId,
        { interestRateBps, interestPeriod },
        query,
      );

      await interestRateHistoryRepository.openFirstSegment(
        userId,
        transactionId,
        interestRateBps,
        transaction.transactionDate,
        query,
      );
    }
  });

  // Accrue interest for any elapsed days (outside the transaction so the
  // newly written rate segment is visible to the accrual query).
  await accrueInterestForTransaction(userId, transactionId);

  return config!;
  } catch (err) {
    if (isPgError(err)) throw mapPgError(err, INTEREST_CONSTRAINT_MESSAGES);
    throw err;
  }
}

/**
 * Soft-deletes the interest config and closes the rate history and open
 * accrual segment at today.
 *
 * @param userId - Acting user
 * @param transactionId - Parent transaction
 * @throws {AppError} 404 if no active config exists
 */
export async function removeInterestConfig(
  userId: string,
  transactionId: string,
): Promise<void> {
  const todayIso = todayIsoInTimeZone();

  const deleted = await interestConfigRepository.softDeleteInterestConfig(userId, transactionId);
  if (!deleted) {
    throw new AppError('No active interest config found for this transaction', 404);
  }

  try {
    await db.withTransaction(async (query) => {
      // Wipe all accrual rows so interest immediately shows as ₹0.
      await interestAccrualRepository.deleteAllAccruals(transactionId, query);

      // Close the rate history segment so the timeline is accurate.
      await interestRateHistoryRepository.closeActiveSegment(
        userId,
        transactionId,
        todayIso,
        query,
      );
    });
  } catch (err) {
    if (isPgError(err)) throw mapPgError(err, INTEREST_CONSTRAINT_MESSAGES);
    throw err;
  }
}
