import { db } from '../config/database.js';
import * as interestAccrualRepository from '../repositories/interestAccrualRepository.js';
import * as interestConfigRepository from '../repositories/interestConfigRepository.js';
import * as personRepository from '../repositories/personRepository.js';
import * as repaymentRepository from '../repositories/repaymentRepository.js';
import * as transactionRepository from '../repositories/transactionRepository.js';
import * as interestAccrualService from '../services/interestAccrualService.js';
import {
  AppError,
  type PersonLedger,
  type Transaction,
  type UpsertTransactionInput,
} from '../types/index.js';
import { calculateNetBalance } from '../utils/balance.js';

/**
 * Retrieves the transaction history, repayments, and net outstanding balance for a person.
 * Accrues interest for every interest-bearing transaction before returning data so the
 * UI always shows today's exact figure without relying on a cron job.
 *
 * @param userId - Authenticated user's ID
 * @param personId - Target person's ID
 * @returns Transaction history plus the computed net balance
 * @throws {AppError} If the person does not belong to the user
 */
export async function getPersonLedger(userId: string, personId: string): Promise<PersonLedger> {
  const person = await personRepository.findPersonById(userId, personId);
  if (!person) {
    throw new AppError('Person not found', 404);
  }

  const transactions = await transactionRepository.findTransactionsByPerson(userId, personId);
  const ids = transactions.map((transaction) => transaction.id);

  // Accrue interest for every interest-bearing transaction so the returned
  // totals reflect today — not the last time a repayment or rate-change fired.
  // accrueInterestForTransaction is idempotent: calling it multiple times on
  // the same day is safe and produces the same result.
  const interestConfigsById = await interestConfigRepository.findByTransactionIds(ids);
  const interestBearingIds = ids.filter((id) => interestConfigsById[id] != null);
  await Promise.all(
    interestBearingIds.map((id) =>
      interestAccrualService.accrueInterestForTransaction(userId, id),
    ),
  );

  const [outstandingById, repayments, accruedInterestById] = await Promise.all([
    transactionRepository.findOutstandingCentsByIds(userId, ids),
    repaymentRepository.findRepaymentsByTransactionIds(ids),
    interestAccrualRepository.sumAccruedInterestCentsByIds(ids),
  ]);

  const repaymentsByTransaction = new Map<string, typeof repayments>();
  for (const repayment of repayments) {
    const current = repaymentsByTransaction.get(repayment.transactionId) ?? [];
    current.push(repayment);
    repaymentsByTransaction.set(repayment.transactionId, current);
  }

  return {
    transactions: transactions.map((transaction) => ({
      ...transaction,
      outstandingCents: outstandingById[transaction.id] ?? transaction.amountCents,
      accruedInterestCents: accruedInterestById[transaction.id] ?? 0,
      interestConfig: interestConfigsById[transaction.id] ?? null,
      repayments: repaymentsByTransaction.get(transaction.id) ?? [],
    })),
    netBalanceCents: calculateNetBalance(transactions, outstandingById),
  };
}

/**
 * Loads one transaction owned by the authenticated user.
 *
 * @param userId - Authenticated user
 * @param transactionId - Transaction id
 * @returns The transaction
 * @throws {AppError} If the transaction is missing or not owned by the user
 */
export async function getTransaction(userId: string, transactionId: string): Promise<Transaction> {
  const transaction = await transactionRepository.findTransactionById(userId, transactionId);
  if (!transaction) {
    throw new AppError('Transaction not found', 404);
  }
  return transaction;
}

/**
 * Records a lend or borrow transaction against a person.
 *
 * @param userId - Authenticated user
 * @param input - Transaction payload (amounts in cents)
 * @returns The created transaction
 * @throws {AppError} If the person does not belong to the user
 */
export async function createTransaction(
  userId: string,
  input: UpsertTransactionInput,
): Promise<Transaction> {
  await assertPersonOwned(userId, input.personId);
  return transactionRepository.createTransaction(userId, normalizeTransactionInput(input));
}

/**
 * Updates a transaction owned by the authenticated user.
 * Blocked when the transaction already has repayments (FR-2.8).
 *
 * When the transaction date changes and an interest config exists, the rate
 * history's effective_from is updated to the new date and all accrual segments
 * are wiped so they rebuild correctly on the next ledger load.
 *
 * @param userId - Authenticated user
 * @param transactionId - Transaction id
 * @param input - Updated fields
 * @returns The updated transaction
 * @throws {AppError} If the person or transaction is missing, or repayments exist
 */
export async function updateTransaction(
  userId: string,
  transactionId: string,
  input: UpsertTransactionInput,
): Promise<Transaction> {
  await assertPersonOwned(userId, input.personId);
  await assertNoRepayments(transactionId, 'You cannot edit a transaction that has repayments');

  const existing = await transactionRepository.findTransactionById(userId, transactionId);
  if (!existing) {
    throw new AppError('Transaction not found', 404);
  }

  const normalized = normalizeTransactionInput(input);
  const dateChanged = normalized.transactionDate !== existing.transactionDate;

  const transaction = await transactionRepository.updateTransaction(
    userId,
    transactionId,
    normalized,
  );
  if (!transaction) {
    throw new AppError('Transaction not found', 404);
  }

  // When the loan date changes, the interest timeline must be rebuilt from scratch.
  // The first rate history segment's effective_from is pinned to the original
  // transaction date — if the date shifts, that segment is wrong and all accrual
  // segments computed from it are also wrong.
  if (dateChanged) {
    const config = await interestConfigRepository.findByTransactionId(transactionId);
    if (config) {
      await db.withTransaction(async (query) => {
        // Reset effective_from on the first (and only, when no rate changes happened)
        // rate history segment to the corrected transaction date.
        await query(
          `UPDATE interest_rate_history
           SET effective_from = $3::date,
               updated_by     = $2
           WHERE transaction_id = $1
             AND effective_from = $4::date`,
          [transactionId, userId, normalized.transactionDate, existing.transactionDate],
        );

        // Wipe all accrual segments — they will be rebuilt correctly on the
        // next call to accrueInterestForTransaction (ledger load or repayment).
        await interestAccrualRepository.deleteAllAccruals(transactionId, query);
      });
    }
  }

  return transaction;
}

/**
 * Soft-deletes a transaction that belongs to the user.
 * If repayments exist, `cascade` must be true and those repayments are soft-deleted too.
 *
 * @param userId - Authenticated user
 * @param transactionId - Transaction to delete
 * @param cascade - Confirm deleting repayments together with the transaction
 * @throws {AppError} If the transaction is missing, or repayments exist without cascade
 */
export async function softDeleteTransaction(
  userId: string,
  transactionId: string,
  cascade = false,
): Promise<void> {
  const transaction = await transactionRepository.findTransactionById(userId, transactionId);
  if (!transaction) {
    throw new AppError('Transaction not found', 404);
  }

  const repaymentCount = await repaymentRepository.countActiveByTransaction(transactionId);
  if (repaymentCount > 0 && !cascade) {
    throw new AppError(
      'This transaction has repayments. Confirm to delete it and its repayments.',
      409,
    );
  }

  if (repaymentCount === 0) {
    const deleted = await transactionRepository.softDeleteTransaction(userId, transactionId);
    if (!deleted) {
      throw new AppError('Transaction not found', 404);
    }
    return;
  }

  await db.withTransaction(async (query) => {
    await repaymentRepository.softDeleteByTransaction(userId, transactionId, query);
    const deleted = await transactionRepository.softDeleteTransaction(userId, transactionId, query);
    if (!deleted) {
      throw new AppError('Transaction not found', 404);
    }
  });
}

/**
 * Confirms the person exists and belongs to the authenticated user.
 *
 * @param userId - Authenticated user
 * @param personId - Person on the transaction
 * @throws {AppError} If the person is missing or not owned by the user
 */
async function assertPersonOwned(userId: string, personId: string): Promise<void> {
  const person = await personRepository.findPersonById(userId, personId);
  if (!person) {
    throw new AppError('Person not found', 404);
  }
}

/**
 * Blocks edits when the transaction already has active repayments.
 *
 * @param transactionId - Transaction to inspect
 * @param message - Client-facing error
 * @throws {AppError} If any active repayment exists
 */
async function assertNoRepayments(transactionId: string, message: string): Promise<void> {
  const repaymentCount = await repaymentRepository.countActiveByTransaction(transactionId);
  if (repaymentCount > 0) {
    throw new AppError(message, 400);
  }
}

/**
 * Trims optional notes so blank strings become omitted values.
 *
 * @param input - Raw upsert payload
 * @returns Normalized payload
 */
function normalizeTransactionInput(input: UpsertTransactionInput): UpsertTransactionInput {
  return {
    personId: input.personId,
    type: input.type,
    amountCents: input.amountCents,
    transactionDate: input.transactionDate,
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  };
}
