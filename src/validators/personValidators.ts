import { z } from 'zod';

export const personIdParamsSchema = z.object({
  personId: z.string().uuid('Enter a valid person id'),
});

export const listPeopleQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().min(1, 'limit must be at least 1').max(100, 'limit cannot exceed 100').optional()),
  q: z
    .string()
    .trim()
    .max(100, 'Search query cannot exceed 100 characters')
    .optional()
    .transform((val) => (val === '' ? undefined : val)),
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
