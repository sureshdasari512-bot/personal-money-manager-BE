import type { Invitation, InvitationStatus } from '../types/index.js';

/**
 * Derives a single status from invitation timestamps.
 *
 * @param invitation - Invitation row
 * @param nowMs - Clock used for expiry (injectable for tests)
 * @returns pending, accepted, revoked, or expired
 */
export function getInvitationStatus(
  invitation: Pick<Invitation, 'acceptedAt' | 'revokedAt' | 'expiresAt'>,
  nowMs: number = Date.now(),
): InvitationStatus {
  if (invitation.revokedAt) {
    return 'revoked';
  }
  if (invitation.acceptedAt) {
    return 'accepted';
  }
  if (invitation.expiresAt.getTime() < nowMs) {
    return 'expired';
  }
  return 'pending';
}
