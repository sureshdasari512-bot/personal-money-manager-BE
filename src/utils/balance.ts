import type { Transaction, TransactionType } from '../types/index.js';

/**
 * Calculates the outstanding balance for a single transaction.
 *
 * @param amountCents - Original transaction amount, in smallest currency unit
 * @param repayments - Repayment amounts (in cents) made against this transaction
 * @returns Remaining outstanding amount in cents. Returns 0 if fully repaid.
 * @throws {Error} If any repayment amount is negative
 */
export function calculateOutstandingBalance(amountCents: number, repayments: number[]): number {
  const totalRepaid = repayments.reduce((sum, repayment) => {
    if (repayment < 0) {
      throw new Error('Repayment amount cannot be negative');
    }
    return sum + repayment;
  }, 0);
  return Math.max(amountCents - totalRepaid, 0);
}

/**
 * Computes net balance for a person: outstanding lends minus outstanding borrows.
 * Positive means the counterpart owes the user; negative means the user owes them.
 *
 * @param transactions - Transactions that already include outstanding amounts
 * @param outstandingById - Map of transaction id → outstanding cents
 * @returns Net outstanding in cents
 */
export function calculateNetBalance(
  transactions: Array<Pick<Transaction, 'id' | 'type'>>,
  outstandingById: Record<string, number>,
): number {
  return transactions.reduce((net, transaction) => {
    const outstanding = outstandingById[transaction.id] ?? 0;
    return transaction.type === 'lend' ? net + outstanding : net - outstanding;
  }, 0);
}

/**
 * Returns the signed contribution of one outstanding amount given its type.
 *
 * @param type - Lend increases what is owed to the user; borrow decreases it
 * @param outstandingCents - Remaining amount on that transaction
 * @returns Signed cents to add to a running net
 */
export function signedOutstanding(type: TransactionType, outstandingCents: number): number {
  return type === 'lend' ? outstandingCents : -outstandingCents;
}
