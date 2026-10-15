import { z } from 'zod';

export const transactionIdParamsSchema = z.object({
  transactionId: z.string().uuid('Enter a valid transaction id'),
});

export const upsertInterestConfigSchema = z
  .object({
    interestRateBps: z
      .number({
        required_error: 'Monthly interest rate is required',
        invalid_type_error: 'Monthly interest rate must be a number',
      })
      .int('Interest rate must be a whole number of basis points')
      .min(1, 'Interest rate must be greater than 0')
      .max(5_000, 'Monthly interest rate cannot exceed 50% per month'),

    interestPeriod: z.enum(['monthly', 'quarterly', 'half_yearly', 'yearly'], {
      errorMap: () => ({
        message: 'Interest period must be one of: monthly, quarterly, half_yearly, yearly',
      }),
    }),

    /**
     * Optional effective date for the new rate (YYYY-MM-DD).
     * When provided, the rate change is recorded from this date instead of today.
     * Must be >= the transaction date and <= today.
     * Defaults to today when omitted.
     */
    effectiveDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveDate must be a valid date (YYYY-MM-DD)')
      .refine((val) => {
        // Reject strings that pass the regex but are not real calendar dates
        // (e.g. 2026-13-99). Date.parse returns NaN for invalid dates.
        const ms = Date.parse(val);
        return !Number.isNaN(ms);
      }, 'effectiveDate is not a valid calendar date')
      .optional(),
  });
