import { describe, expect, it } from 'vitest';
import { allocateFifo } from './allocateFifo.js';

describe('allocateFifo', () => {
  it('applies the full amount to the oldest target when it covers the payment', () => {
    const slices = allocateFifo(4000, [
      { id: 'a', outstandingCents: 75000 },
      { id: 'b', outstandingCents: 20000 },
    ]);
    expect(slices).toEqual([{ id: 'a', amountCents: 4000, outstandingAfterCents: 71000 }]);
  });

  it('splits across targets oldest first when one loan is not enough', () => {
    const slices = allocateFifo(90000, [
      { id: 'a', outstandingCents: 75000 },
      { id: 'b', outstandingCents: 20000 },
      { id: 'c', outstandingCents: 10000 },
    ]);
    expect(slices).toEqual([
      { id: 'a', amountCents: 75000, outstandingAfterCents: 0 },
      { id: 'b', amountCents: 15000, outstandingAfterCents: 5000 },
    ]);
  });

  it('throws when the payment exceeds total outstanding', () => {
    expect(() => allocateFifo(500, [{ id: 'a', outstandingCents: 400 }])).toThrow(
      'Payment amount exceeds outstanding balance',
    );
  });

  it('skips targets with no outstanding balance', () => {
    const slices = allocateFifo(100, [
      { id: 'a', outstandingCents: 0 },
      { id: 'b', outstandingCents: 250 },
    ]);
    expect(slices).toEqual([{ id: 'b', amountCents: 100, outstandingAfterCents: 150 }]);
  });
});
