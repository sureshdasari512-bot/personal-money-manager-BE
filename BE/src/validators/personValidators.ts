import { z } from 'zod';

export const personIdParamsSchema = z.object({
  personId: z.string().uuid('Enter a valid person id'),
});

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

export const upsertPersonSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  phone: optionalText,
  email: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === '' ? undefined : value))
    .pipe(z.string().email('Enter a valid email').optional()),
  notes: optionalText,
});
