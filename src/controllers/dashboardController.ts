import type { NextFunction, Request, Response } from 'express';
import { requireUser } from '../middlewares/requireUser.js';
import * as dashboardService from '../services/dashboardService.js';

/**
 * GET /dashboard
 * Returns net-position totals, people with balances, and due lists.
 */
export async function getDashboardHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const dashboard = await dashboardService.getDashboard(userId);
    res.status(200).json({ dashboard });
  } catch (err) {
    next(err);
  }
}
