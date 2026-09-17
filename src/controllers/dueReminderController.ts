import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { processDueReminders } from '../services/dueReminderService.js';
import { AppError } from '../types/index.js';

/**
 * POST /internal/due-reminders
 * Secret-protected trigger so a host cron can wake the scan if the web process slept.
 */
export async function runDueRemindersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!env.cronSecret) {
      throw new AppError('Due reminder trigger is not configured. Set CRON_SECRET.', 503);
    }
    if (req.header('x-cron-secret') !== env.cronSecret) {
      throw new AppError('Unauthorized', 401);
    }

    const result = await processDueReminders();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
