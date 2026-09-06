import { z } from 'zod';

export const transactionIdParamsSchema = z.object({
  transactionId: z.string().uuid('Enter a valid transaction id'),
});

export const deleteTransactionQuerySchema = z.object({
  cascade: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

export const upsertTransactionSchema = z
  .object({
    personId: z.string().uuid('Enter a valid person'),
    type: z.enum(['lend', 'borrow'], {
      errorMap: () => ({ message: 'Type must be lend or borrow' }),
    }),
    amountCents: z
      .number({ invalid_type_error: 'Amount is required' })
      .int('Amount must be a whole number of cents')
      .positive('Amount must be greater than 0'),
    transactionDate: z.string().date('Enter a valid transaction date'),
    dueDate: z.string().date('Enter a valid due date').optional(),
    notes: optionalText,
  })
  .refine((value) => !value.dueDate || value.dueDate >= value.transactionDate, {
    message: 'Due date cannot be before the transaction date',
    path: ['dueDate'],
  });
