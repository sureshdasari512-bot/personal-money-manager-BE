import { describe, expect, it } from 'vitest';
import { getInvitationStatus } from './invitationStatus.js';

const now = Date.parse('2026-09-06T10:00:00.000Z');

describe('getInvitationStatus', () => {
  it('returns revoked before accepted or expired', () => {
    expect(
      getInvitationStatus(
        {
          acceptedAt: null,
          revokedAt: new Date(now - 1000),
          expiresAt: new Date(now + 1000),
        },
        now,
      ),
    ).toBe('revoked');
  });

  it('returns accepted when accepted_at is set', () => {
    expect(
      getInvitationStatus(
        {
          acceptedAt: new Date(now - 1000),
          revokedAt: null,
          expiresAt: new Date(now + 1000),
        },
        now,
      ),
    ).toBe('accepted');
  });

  it('returns expired when the invite is past due and unused', () => {
    expect(
      getInvitationStatus(
        {
          acceptedAt: null,
          revokedAt: null,
          expiresAt: new Date(now - 1000),
        },
        now,
      ),
    ).toBe('expired');
  });

  it('returns pending when unused and still valid', () => {
    expect(
      getInvitationStatus(
        {
          acceptedAt: null,
          revokedAt: null,
          expiresAt: new Date(now + 1000),
        },
        now,
      ),
    ).toBe('pending');
  });
});
