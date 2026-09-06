import type { NextFunction, Request, Response } from 'express';
import { requireUser } from '../middlewares/requireUser.js';
import * as repaymentService from '../services/repaymentService.js';
import type { CreateRepaymentInput } from '../types/index.js';

/**
 * GET /transactions/:transactionId/repayments
 * Lists repayments for a transaction owned by the authenticated user.
 */
export async function listRepaymentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const { transactionId } = req.params as { transactionId: string };
    const repayments = await repaymentService.listRepayments(userId, transactionId);
    res.status(200).json({ repayments });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /transactions/:transactionId/repayments
 * Records a repayment against a transaction.
 */
export async function createRepaymentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const { transactionId } = req.params as { transactionId: string };
    const repayment = await repaymentService.addRepayment(
      userId,
      transactionId,
      req.body as CreateRepaymentInput,
    );
    res.status(201).json({ repayment });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /transactions/:transactionId/repayments/:repaymentId
 * Soft-deletes a repayment.
 */
export async function deleteRepaymentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const { repaymentId } = req.params as { repaymentId: string };
    await repaymentService.deleteRepayment(userId, repaymentId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
