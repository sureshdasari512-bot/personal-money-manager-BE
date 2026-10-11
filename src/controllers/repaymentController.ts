import type { NextFunction, Request, Response } from 'express';
import { requireUser } from '../middlewares/requireUser.js';
import * as repaymentService from '../services/repaymentService.js';
import type { CreateRepaymentInput } from '../types/index.js';

/**
 * GET /transactions/:transactionId/repayments/preview?amountCents=N
 * Returns how a proposed payment would be split: interest cleared first,
 * remainder reduces principal. Read-only — no writes are made.
 */
export async function previewRepaymentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const { transactionId } = req.params as { transactionId: string };
    const amountCents = Math.round(Number(req.query.amountCents));
    const preview = await repaymentService.previewRepayment(userId, transactionId, amountCents);
    res.status(200).json({ preview });
  } catch (err) {
    next(err);
  }
}

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
 * POST /people/:personId/repayments
 * Records a person-level payment and splits it FIFO across outstanding lends.
 */
export async function createPersonRepaymentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const { personId } = req.params as { personId: string };
    const result = await repaymentService.addPersonRepayment(
      userId,
      personId,
      req.body as CreateRepaymentInput,
    );
    res.status(201).json(result);
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
