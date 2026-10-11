import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { processInterestReminders } from '../services/interestReminderService.js';
import { AppError } from '../types/index.js';

/**
 * POST /internal/interest-reminders
 * Secret-protected trigger so a host cron can wake the scan if the web process slept.
 * Mirrors the pattern of dueReminderController exactly.
 */
export async function runInterestRemindersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!env.cronSecret) {
      throw new AppError(
        'Interest reminder trigger is not configured. Set CRON_SECRET.',
        503,
      );
    }
    if (req.header('x-cron-secret') !== env.cronSecret) {
      throw new AppError('Unauthorized', 401);
    }

    const result = await processInterestReminders();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
