import { describe, expect, it } from 'vitest';
import { mapSmtpError } from './smtpError.js';

describe('mapSmtpError', () => {
  it('maps SMTP auth failures to a global 503', () => {
    const err = mapSmtpError({ code: 'EAUTH', message: 'Invalid login: 535 Username and Password not accepted' });
    expect(err.statusCode).toBe(503);
    expect(err.fields).toBeNull();
    expect(err.message).toContain('SMTP login');
  });

  it('maps connection failures to a global 503', () => {
    const err = mapSmtpError({ code: 'ECONNECTION', message: 'connect ETIMEDOUT' });
    expect(err.statusCode).toBe(503);
    expect(err.message).toContain('mail server');
  });

  it('maps other send failures to a global 502', () => {
    const err = mapSmtpError(new Error('Message rejected'));
    expect(err.statusCode).toBe(502);
    expect(err.message).toBe('Message rejected');
  });
});
