export interface AllocationTarget {
  id: string;
  outstandingCents: number;
}

export interface AllocationSlice {
  id: string;
  amountCents: number;
  outstandingAfterCents: number;
}

/**
 * Splits a payment across outstanding targets oldest-first (FIFO).
 * Callers must ensure `amountCents` is positive and does not exceed the total outstanding.
 *
 * @param amountCents - Payment amount in cents
 * @param targets - Outstanding items already sorted oldest first
 * @returns One slice per target that receives money
 * @throws {Error} If the amount is not a positive integer or exceeds total outstanding
 */
export function allocateFifo(amountCents: number, targets: AllocationTarget[]): AllocationSlice[] {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('Payment amount must be a positive integer');
  }

  const totalOutstanding = targets.reduce((sum, target) => sum + target.outstandingCents, 0);
  if (amountCents > totalOutstanding) {
    throw new Error('Payment amount exceeds outstanding balance');
  }

  let remaining = amountCents;
  const slices: AllocationSlice[] = [];

  for (const target of targets) {
    if (remaining === 0) {
      break;
    }
    if (target.outstandingCents <= 0) {
      continue;
    }

    const applied = Math.min(remaining, target.outstandingCents);
    slices.push({
      id: target.id,
      amountCents: applied,
      outstandingAfterCents: target.outstandingCents - applied,
    });
    remaining -= applied;
  }

  return slices;
}
