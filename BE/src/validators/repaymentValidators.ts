import { z } from 'zod';

export const transactionIdParamsSchema = z.object({
  transactionId: z.string().uuid('Enter a valid transaction id'),
});

export const repaymentParamsSchema = z.object({
  transactionId: z.string().uuid('Enter a valid transaction id'),
  repaymentId: z.string().uuid('Enter a valid repayment id'),
});

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

export const createRepaymentSchema = z.object({
  amountCents: z
    .number({ invalid_type_error: 'Amount is required' })
    .int('Amount must be a whole number of cents')
    .positive('Amount must be greater than 0'),
  paidOn: z.string().date('Enter a valid payment date'),
  notes: optionalText,
});
