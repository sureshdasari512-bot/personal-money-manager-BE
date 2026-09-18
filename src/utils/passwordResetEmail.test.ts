import { describe, expect, it } from 'vitest';
import { buildPasswordResetEmail, buildPasswordResetUrl } from './passwordResetEmail.js';

describe('buildPasswordResetUrl', () => {
  it('strips a trailing slash and encodes the token', () => {
    expect(buildPasswordResetUrl('http://localhost:5173/', 'ab/c')).toBe(
      'http://localhost:5173/reset-password?token=ab%2Fc',
    );
  });
});

describe('buildPasswordResetEmail', () => {
  it('includes the reset link and one-hour expiry', () => {
    const email = buildPasswordResetEmail({
      token: 'abc123',
      frontendOrigin: 'http://localhost:5173',
    });
    expect(email.subject).toContain('Reset');
    expect(email.text).toContain('http://localhost:5173/reset-password?token=abc123');
    expect(email.html).toContain('http://localhost:5173/reset-password?token=abc123');
    expect(email.text).toContain('1 hour');
    expect(email.html).toContain('Reset password');
    expect(email.html).toContain('Password reset');
    expect(email.html).toContain('What to do next');
    expect(email.text).toContain('ignore this email');
  });
});
