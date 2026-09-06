import type { TransactionStatus } from '../types/index.js';

/**
 * Derives payment status from original amount and remaining outstanding.
 * `cancelled` is set only by soft-delete, not here.
 *
 * @param amountCents - Original transaction amount
 * @param outstandingCents - Remaining unpaid amount
 * @returns pending, partially_paid, or paid
 */
export function paymentStatusFromOutstanding(
  amountCents: number,
  outstandingCents: number,
): Exclude<TransactionStatus, 'cancelled'> {
  if (outstandingCents <= 0) {
    return 'paid';
  }
  if (outstandingCents < amountCents) {
    return 'partially_paid';
  }
  return 'pending';
}
