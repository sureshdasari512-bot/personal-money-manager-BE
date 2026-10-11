import { db } from '../config/database.js';
import * as allocationRepository from '../repositories/allocationRepository.js';
import * as interestAccrualRepository from '../repositories/interestAccrualRepository.js';
import * as repaymentRepository from '../repositories/repaymentRepository.js';
import * as transactionRepository from '../repositories/transactionRepository.js';
import {
  AppError,
  type CreateRepaymentInput,
  type PersonRepaymentResult,
  type Repayment,
  type RepaymentPreview,
} from '../types/index.js';
import { allocateFifo } from '../utils/allocateFifo.js';
import { calculateOutstandingBalance } from '../utils/balance.js';
import { paymentStatusFromOutstanding } from '../utils/transactionStatus.js';
import * as personService from './personService.js';
import * as interestAccrualService from './interestAccrualService.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Computes the interest-first allocation breakdown for a payment amount.
 * Interest is cleared before any principal is reduced.
 *
 * @param amountCents - Payment being made
 * @param outstandingPrincipalCents - Remaining principal before this payment
 * @param accruedInterestCents - Total unpaid interest before this payment
 * @returns How much goes to interest and how much to principal
 */
function splitInterestFirst(
  amountCents: number,
  _outstandingPrincipalCents: number,
  accruedInterestCents: number,
): { towardInterestCents: number; towardPrincipalCents: number } {
  const towardInterestCents = Math.min(amountCents, accruedInterestCents);
  const towardPrincipalCents = amountCents - towardInterestCents;
  return { towardInterestCents, towardPrincipalCents };
}

// ---------------------------------------------------------------------------
// Public service functions
// ---------------------------------------------------------------------------

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
 * Returns a preview breakdown of how a proposed repayment amount would be
 * allocated — interest cleared first, remainder reduces principal.
 * No writes are made; this is read-only.
 *
 * @param userId - Authenticated user
 * @param transactionId - Parent transaction
 * @param amountCents - Proposed payment amount in cents
 * @returns Breakdown of interest vs principal allocation
 * @throws {AppError} 404 if transaction not found, 400 if amount is invalid
 */
export async function previewRepayment(
  userId: string,
  transactionId: string,
  amountCents: number,
): Promise<RepaymentPreview> {
  // Trigger accrual so the preview always reflects up-to-date interest.
  await interestAccrualService.accrueInterestForTransaction(userId, transactionId);

  const [transaction, existingRepayments, accruedInterestCents] = await Promise.all([
    transactionRepository.findTransactionById(userId, transactionId),
    repaymentRepository.findRepaymentsByTransaction(transactionId),
    interestAccrualRepository.sumAccruedInterestCents(transactionId),
  ]);

  if (!transaction) {
    throw new AppError('Transaction not found', 404);
  }

  const outstandingPrincipalBefore = calculateOutstandingBalance(
    transaction.amountCents,
    existingRepayments.map((r) => r.towardPrincipalCents),
  );

  const totalOwed = outstandingPrincipalBefore + accruedInterestCents;

  if (amountCents <= 0) {
    throw new AppError('Please fix the highlighted fields', 400, {
      amountCents: 'Amount must be greater than 0',
    });
  }

  if (amountCents > totalOwed) {
    throw new AppError('Please fix the highlighted fields', 400, {
      amountCents: `Amount cannot exceed the total owed (principal ${outstandingPrincipalBefore} + interest ${accruedInterestCents})`,
    });
  }

  const { towardInterestCents, towardPrincipalCents } = splitInterestFirst(
    amountCents,
    outstandingPrincipalBefore,
    accruedInterestCents,
  );

  const outstandingPrincipalAfter = Math.max(outstandingPrincipalBefore - towardPrincipalCents, 0);
  const remainingInterestCents = Math.max(accruedInterestCents - towardInterestCents, 0);
  const willFullySettle = outstandingPrincipalAfter === 0 && remainingInterestCents === 0;

  return {
    amountCents,
    accruedInterestCents,
    towardInterestCents,
    towardPrincipalCents,
    outstandingPrincipalBefore,
    outstandingPrincipalAfter,
    remainingInterestCents,
    willFullySettle,
  };
}

/**
 * Records a partial or full repayment inside a DB transaction.
 * Interest is cleared first; any remainder reduces outstanding principal.
 * Settlement status is updated only when BOTH principal and interest hit zero.
 *
 * @param userId - Authenticated user
 * @param transactionId - Parent transaction
 * @param input - Amount in cents, payment date, optional notes
 * @returns The created repayment
 * @throws {AppError} If the transaction is missing or the amount exceeds total owed
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

  // Accrue up-to-date interest before writing so the allocation is accurate.
  await interestAccrualService.accrueInterestForTransaction(userId, transactionId);

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
    const outstandingPrincipal = calculateOutstandingBalance(
      transaction.amountCents,
      existing.map((r) => r.towardPrincipalCents),
    );
    const accruedInterestCents = await interestAccrualRepository.sumAccruedInterestCents(
      transactionId,
    );
    const totalOwed = outstandingPrincipal + accruedInterestCents;

    if (normalized.amountCents > totalOwed) {
      throw new AppError('Please fix the highlighted fields', 400, {
        amountCents: 'Amount exceeds the total outstanding (principal + interest)',
      });
    }

    // Interest-first: determine how much goes to principal after clearing interest.
    const { towardPrincipalCents } = splitInterestFirst(
      normalized.amountCents,
      outstandingPrincipal,
      accruedInterestCents,
    );

    const repayment = await repaymentRepository.createRepayment(
      userId,
      transactionId,
      { ...normalized, towardPrincipalCents },
      query,
    );

    const outstandingPrincipalAfter = Math.max(outstandingPrincipal - towardPrincipalCents, 0);

    // Recalculate remaining interest after this payment.
    const remainingInterest = Math.max(
      accruedInterestCents - (normalized.amountCents - towardPrincipalCents),
      0,
    );

    // Settled only when BOTH principal and remaining interest are zero.
    await transactionRepository.updateTransactionStatus(
      userId,
      transactionId,
      paymentStatusFromOutstanding(
        transaction.amountCents,
        outstandingPrincipalAfter + remainingInterest,
      ),
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
      lends.map((t) => t.id),
      query,
    );

    const eligible = lends
      .filter((t) => t.transactionDate <= normalized.paidOn)
      .map((t) => ({
        id: t.id,
        amountCents: t.amountCents,
        outstandingCents: outstandingById[t.id] ?? 0,
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
      const parent = lends.find((t) => t.id === slice.id);
      if (!parent) {
        throw new AppError('Transaction not found', 404);
      }

      const repayment = await repaymentRepository.createRepayment(
        userId,
        slice.id,
        {
          amountCents: slice.amountCents,
          // FIFO person-level payments go entirely to principal (no interest context).
          towardPrincipalCents: slice.amountCents,
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
      remaining.map((r) => r.towardPrincipalCents),
    );
    await transactionRepository.updateTransactionStatus(
      userId,
      transactionId,
      paymentStatusFromOutstanding(transaction.amountCents, outstanding),
      query,
    );
  });
}
