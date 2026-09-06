import type { NextFunction, Request, Response } from 'express';
import { requireUser } from '../middlewares/requireUser.js';
import * as transactionService from '../services/transactionService.js';
import type { UpsertTransactionInput } from '../types/index.js';

/**
 * GET /people/:personId/ledger
 * Returns transaction history and net balance for a person.
 */
export async function getPersonLedgerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { personId } = req.params as { personId: string };
    const { userId } = requireUser(req);
    const ledger = await transactionService.getPersonLedger(userId, personId);
    res.status(200).json(ledger);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /transactions/:transactionId
 * Returns one transaction owned by the authenticated user.
 */
export async function getTransactionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const { transactionId } = req.params as { transactionId: string };
    const transaction = await transactionService.getTransaction(userId, transactionId);
    res.status(200).json({ transaction });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /transactions
 * Records a lend or borrow transaction.
 */
export async function createTransactionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const transaction = await transactionService.createTransaction(
      userId,
      req.body as UpsertTransactionInput,
    );
    res.status(201).json({ transaction });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /transactions/:transactionId
 * Updates a transaction owned by the authenticated user.
 */
export async function updateTransactionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const { transactionId } = req.params as { transactionId: string };
    const transaction = await transactionService.updateTransaction(
      userId,
      transactionId,
      req.body as UpsertTransactionInput,
    );
    res.status(200).json({ transaction });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /transactions/:transactionId
 * Soft-deletes a transaction.
 */
export async function deleteTransactionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const { transactionId } = req.params as { transactionId: string };
    const { cascade } = req.query as { cascade?: boolean };
    await transactionService.softDeleteTransaction(userId, transactionId, cascade === true);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
