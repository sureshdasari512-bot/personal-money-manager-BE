import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { mapZodFieldErrors } from './fieldErrors.js';

describe('mapZodFieldErrors', () => {
  it('returns the first message per field', () => {
    const schema = z.object({
      email: z.string().email('Enter a valid email'),
      password: z.string().min(8, 'Password must be at least 8 characters'),
    });
    const parsed = schema.safeParse({ email: 'bad', password: 'short' });
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }
    expect(mapZodFieldErrors(parsed.error)).toEqual({
      email: 'Enter a valid email',
      password: 'Password must be at least 8 characters',
    });
  });
});
