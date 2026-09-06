import { z } from 'zod';

export const userIdParamsSchema = z.object({
  userId: z.string().uuid(),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'user']),
});

export const updateUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'user']),
  isActive: z.boolean(),
});

export const setUserAccessSchema = z.object({
  isActive: z.boolean(),
});
