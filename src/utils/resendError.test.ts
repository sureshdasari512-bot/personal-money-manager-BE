import { describe, expect, it } from 'vitest';
import { mapResendError } from './resendError.js';

describe('mapResendError', () => {
  it('maps an unverified from-domain to a global 400', () => {
    const err = mapResendError({
      message: 'The dasarisuresh44@gmail.com domain is not verified. Please, add and verify your domain.',
      statusCode: 403,
    });
    expect(err.statusCode).toBe(400);
    expect(err.fields).toBeNull();
    expect(err.message).toContain('domain is not verified');
  });

  it('maps test-mode recipient limits to an email field error', () => {
    const err = mapResendError({
      message: 'You can only send testing emails to your own email address (you@example.com).',
      statusCode: 403,
    });
    expect(err.statusCode).toBe(400);
    expect(err.fields?.email).toContain('testing emails');
  });

  it('maps API key failures to a global 503', () => {
    const err = mapResendError({
      message: 'Invalid API key',
      statusCode: 401,
    });
    expect(err.statusCode).toBe(503);
    expect(err.message).toContain('API key');
  });
});
