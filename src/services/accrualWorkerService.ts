import * as interestConfigRepository from '../repositories/interestConfigRepository.js';
import * as interestAccrualService from './interestAccrualService.js';
import { todayIsoInTimeZone } from '../utils/isoCalendar.js';
import { logger } from '../utils/logger.js';

export interface AccrualRunResult {
  todayIso: string;
  processed: number;
  skipped: number;
  failed: number;
}

/**
 * Accrues interest for every active interest-bearing transaction in the system.
 * Called nightly by the GitHub Actions cron at 00:01 IST so the dashboard
 * always shows today's figure without relying on on-demand accrual in the GET.
 *
 * Safe to call multiple times — accrueInterestForTransaction is idempotent.
 * Same-day re-runs overwrite the open segment with the same value.
 *
 * @returns Counts of processed, skipped, and failed transactions
 */
export async function accrueAllActive(): Promise<AccrualRunResult> {
  const todayIso = todayIsoInTimeZone();
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  logger.info({ todayIso }, 'Nightly accrual: starting');

  // Load all active (non-paid, non-cancelled) transactions that have an
  // interest config across every user in the system.
  const allConfigs = await interestConfigRepository.findAllActive();

  if (allConfigs.length === 0) {
    logger.info({ todayIso }, 'Nightly accrual: no active interest-bearing transactions');
    return { todayIso, processed: 0, skipped: 0, failed: 0 };
  }

  logger.info({ todayIso, total: allConfigs.length }, 'Nightly accrual: processing transactions');

  for (const config of allConfigs) {
    try {
      const accruals = await interestAccrualService.accrueInterestForTransaction(
        config.userId,
        config.transactionId,
      );

      if (accruals.length === 0) {
        skipped += 1;
      } else {
        processed += 1;
      }
    } catch (err) {
      failed += 1;
      logger.error(
        { err, transactionId: config.transactionId, userId: config.userId },
        'Nightly accrual: failed for transaction',
      );
    }
  }

  logger.info({ todayIso, processed, skipped, failed }, 'Nightly accrual: finished');
  return { todayIso, processed, skipped, failed };
}
