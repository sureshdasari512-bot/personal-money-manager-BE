import { db } from '../config/database.js';
import * as allocationRepository from '../repositories/allocationRepository.js';
import * as repaymentRepository from '../repositories/repaymentRepository.js';
import * as transactionRepository from '../repositories/transactionRepository.js';
import {
  AppError,
  type CreateRepaymentInput,
  type PersonRepaymentResult,
  type Repayment,
} from '../types/index.js';
import { allocateFifo } from '../utils/allocateFifo.js';
import { calculateOutstandingBalance } from '../utils/balance.js';
import { paymentStatusFromOutstanding } from '../utils/transactionStatus.js';
import * as personService from './personService.js';

/**
 * Lists active repayments for a transaction the user owns.
 *
 * @param userId - Authenticated user
 * @param transactionId - Parent transaction
 * @returns Repayment history
 * @throws {AppError} If the transaction is missing or not owned by the user
 */
export async function listRepayments(userId: string, transactionId: string): Promise<Repayment[]> {
  const transaction = await transactionRepository.findTransactionById(userId, transactionId);
  if (!transaction) {
    throw new AppError('Transaction not found', 404);
  }
  return repaymentRepository.findRepaymentsByTransaction(transactionId);
}

/**
 * Records a partial or full repayment inside a DB transaction.
 * Locks the parent row so concurrent repayments cannot exceed outstanding.
 *
 * @param userId - Authenticated user
 * @param transactionId - Parent transaction
 * @param input - Amount in cents, payment date, optional notes
 * @returns The created repayment
 * @throws {AppError} If the transaction is missing or the amount exceeds outstanding
 */
export async function addRepayment(
  userId: string,
  transactionId: string,
  input: CreateRepaymentInput,
): Promise<Repayment> {
  const normalized = {
    amountCents: input.amountCents,
    paidOn: input.paidOn,
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  };

  return db.withTransaction(async (query) => {
    const transaction = await transactionRepository.findTransactionByIdForUpdate(
      query,
      userId,
      transactionId,
    );
    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }

    if (normalized.paidOn < transaction.transactionDate) {
      throw new AppError('Please fix the highlighted fields', 400, {
        paidOn: 'Payment date cannot be before the transaction date',
      });
    }

    const existing = await repaymentRepository.findRepaymentsByTransaction(transactionId, query);
    const outstanding = calculateOutstandingBalance(
      transaction.amountCents,
      existing.map((repayment) => repayment.amountCents),
    );

    if (normalized.amountCents > outstanding) {
      throw new AppError('Please fix the highlighted fields', 400, {
        amountCents: 'Amount is more than the remaining balance',
      });
    }

    const repayment = await repaymentRepository.createRepayment(
      userId,
      transactionId,
      normalized,
      query,
    );
    const outstandingAfter = outstanding - normalized.amountCents;
    await transactionRepository.updateTransactionStatus(
      userId,
      transactionId,
      paymentStatusFromOutstanding(transaction.amountCents, outstandingAfter),
      query,
    );
    return repayment;
  });
}

/**
 * Records a person-level payment and splits it FIFO across outstanding lends.
 * Writes one allocation header plus one repayment slice per loan that receives money.
 *
 * @param userId - Authenticated user
 * @param personId - Person who paid the user
 * @param input - Amount in cents, payment date, optional notes
 * @returns The allocation header and created repayment slices
 * @throws {AppError} If the person is missing, nothing is outstanding, or the amount is too large
 */
export async function addPersonRepayment(
  userId: string,
  personId: string,
  input: CreateRepaymentInput,
): Promise<PersonRepaymentResult> {
  await personService.getPerson(userId, personId);

  const normalized = {
    amountCents: input.amountCents,
    paidOn: input.paidOn,
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  };

  return db.withTransaction(async (query) => {
    const lends = await transactionRepository.findLendTransactionsByPersonForUpdate(
      query,
      userId,
      personId,
    );
    const outstandingById = await transactionRepository.findOutstandingCentsByIds(
      userId,
      lends.map((transaction) => transaction.id),
      query,
    );

    const eligible = lends
      .filter((transaction) => transaction.transactionDate <= normalized.paidOn)
      .map((transaction) => ({
        id: transaction.id,
        amountCents: transaction.amountCents,
        outstandingCents: outstandingById[transaction.id] ?? 0,
      }))
      .filter((target) => target.outstandingCents > 0);

    const totalOutstanding = eligible.reduce((sum, target) => sum + target.outstandingCents, 0);

    if (eligible.length === 0 || totalOutstanding <= 0) {
      throw new AppError('Please fix the highlighted fields', 400, {
        amountCents: 'This person has no outstanding money they owe you on or before this date',
      });
    }

    if (normalized.amountCents > totalOutstanding) {
      throw new AppError('Please fix the highlighted fields', 400, {
        amountCents: 'Amount is more than they still owe you',
      });
    }

    const slices = allocateFifo(normalized.amountCents, eligible);
    const allocation = await allocationRepository.createAllocation(
      userId,
      {
        personId,
        totalAmountCents: normalized.amountCents,
        paidOn: normalized.paidOn,
        ...(normalized.notes ? { notes: normalized.notes } : {}),
      },
      query,
    );

    const repayments: Repayment[] = [];
    for (const slice of slices) {
      const parent = lends.find((transaction) => transaction.id === slice.id);
      if (!parent) {
        throw new AppError('Transaction not found', 404);
      }

      const repayment = await repaymentRepository.createRepayment(
        userId,
        slice.id,
        {
          amountCents: slice.amountCents,
          paidOn: normalized.paidOn,
          allocationId: allocation.id,
          ...(normalized.notes ? { notes: normalized.notes } : {}),
        },
        query,
      );
      await transactionRepository.updateTransactionStatus(
        userId,
        slice.id,
        paymentStatusFromOutstanding(parent.amountCents, slice.outstandingAfterCents),
        query,
      );
      repayments.push(repayment);
    }

    return { allocation, repayments };
  });
}

/**
 * Soft-deletes a repayment on a transaction the user owns.
 *
 * @param userId - Authenticated user
 * @param repaymentId - Repayment to remove
 * @throws {AppError} If the repayment is missing or not owned by the user
 */
export async function deleteRepayment(userId: string, repaymentId: string): Promise<void> {
  await db.withTransaction(async (query) => {
    const transactionId = await repaymentRepository.softDeleteRepayment(userId, repaymentId, query);
    if (!transactionId) {
      throw new AppError('Repayment not found', 404);
    }

    const transaction = await transactionRepository.findTransactionByIdForUpdate(
      query,
      userId,
      transactionId,
    );
    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }

    const remaining = await repaymentRepository.findRepaymentsByTransaction(transactionId, query);
    const outstanding = calculateOutstandingBalance(
      transaction.amountCents,
      remaining.map((repayment) => repayment.amountCents),
    );
    await transactionRepository.updateTransactionStatus(
      userId,
      transactionId,
      paymentStatusFromOutstanding(transaction.amountCents, outstanding),
      query,
    );
  });
}
