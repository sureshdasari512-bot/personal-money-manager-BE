import { describe, expect, it } from 'vitest';
import { buildInvitationEmail, buildInviteUrl } from './invitationEmail.js';

describe('buildInviteUrl', () => {
  it('strips a trailing slash and encodes the token', () => {
    expect(buildInviteUrl('http://localhost:5173/', 'ab/c')).toBe(
      'http://localhost:5173/invite?token=ab%2Fc',
    );
  });
});

describe('buildInvitationEmail', () => {
  it('includes the activate link and expiry window', () => {
    const email = buildInvitationEmail({
      token: 'abc123',
      frontendOrigin: 'http://localhost:5173',
    });
    expect(email.subject).toContain('Activate');
    expect(email.text).toContain('http://localhost:5173/invite?token=abc123');
    expect(email.html).toContain('http://localhost:5173/invite?token=abc123');
    expect(email.text).toContain('48 hours');
  });
});
