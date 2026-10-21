import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { accrueAllActive } from '../services/accrualWorkerService.js';
import { AppError } from '../types/index.js';

/**
 * POST /internal/accrue-interest
 * Secret-protected trigger called by GitHub Actions at 00:01 IST every night.
 * Accrues interest for every active interest-bearing transaction across all users.
 * Safe to call multiple times — idempotent.
 */
export async function runAccrualHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!env.cronSecret) {
      throw new AppError('Accrual trigger is not configured. Set CRON_SECRET.', 503);
    }
    if (req.header('x-cron-secret') !== env.cronSecret) {
      throw new AppError('Unauthorized', 401);
    }

    const result = await accrueAllActive();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
