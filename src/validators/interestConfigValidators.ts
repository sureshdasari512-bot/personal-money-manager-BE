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
  });
