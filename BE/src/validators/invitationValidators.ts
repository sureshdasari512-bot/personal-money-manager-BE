import { z } from 'zod';

export const invitationIdParamsSchema = z.object({
  invitationId: z.string().uuid('Enter a valid invitation id'),
});

export const createInvitationSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  role: z.enum(['admin', 'user'], {
    errorMap: () => ({ message: 'Role must be admin or user' }),
  }).default('user'),
});
