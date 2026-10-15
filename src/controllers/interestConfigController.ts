import type { NextFunction, Request, Response } from 'express';
import { requireUser } from '../middlewares/requireUser.js';
import * as interestAccrualService from '../services/interestAccrualService.js';
import type { UpsertInterestConfigInput } from '../types/index.js';

/**
 * PUT /transactions/:transactionId/interest-config
 * Creates or updates the simple-interest config for a transaction.
 */
export async function upsertInterestConfigHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const { transactionId } = req.params as { transactionId: string };
    const { interestRateBps, interestPeriod, effectiveDate } = req.body as UpsertInterestConfigInput;

    const config = await interestAccrualService.upsertInterestConfig(
      userId,
      transactionId,
      interestRateBps,
      interestPeriod,
      effectiveDate,
    );

    res.status(200).json({ interestConfig: config });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /transactions/:transactionId/interest-config
 * Soft-deletes the interest config for a transaction.
 * Accrual history is preserved for auditability.
 */
export async function deleteInterestConfigHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const { transactionId } = req.params as { transactionId: string };

    await interestAccrualService.removeInterestConfig(userId, transactionId);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

/**
 * GET /transactions/:transactionId/interest-config/history
 * Returns the full interest rate history and paired accrual segments for a
 * transaction. Powers the per-loan rate history ledger on the frontend.
 */
export async function getInterestRateHistoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const { transactionId } = req.params as { transactionId: string };

    const history = await interestAccrualService.getInterestRateHistory(userId, transactionId);

    res.status(200).json(history);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /transactions/:transactionId/interest-config/accrue
 * Triggers interest accrual computation for a transaction.
 * Safe to call multiple times — idempotent.
 */
export async function accrueInterestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const { transactionId } = req.params as { transactionId: string };

    const newAccruals = await interestAccrualService.accrueInterestForTransaction(
      userId,
      transactionId,
    );

    res.status(200).json({ accruals: newAccruals });
  } catch (err) {
    next(err);
  }
}
