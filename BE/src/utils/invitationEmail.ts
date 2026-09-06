import { MAX_INVITE_EXPIRY_HOURS } from '../config/env.js';
import type { InvitationEmailContent } from '../services/emailChannel.js';

/**
 * Builds the activate-account URL the invitee opens in the browser.
 *
 * @param frontendOrigin - Frontend origin with no trailing slash
 * @param token - Opaque invitation token
 * @returns Invite accept URL
 */
export function buildInviteUrl(frontendOrigin: string, token: string): string {
  const origin = frontendOrigin.replace(/\/$/, '');
  return `${origin}/invite?token=${encodeURIComponent(token)}`;
}

/**
 * Builds the invitation email subject and bodies. Pure and unit-testable.
 *
 * @param input - Invitee email, token, and frontend origin
 * @returns Subject plus html/text bodies
 */
export function buildInvitationEmail(input: {
  token: string;
  frontendOrigin: string;
}): InvitationEmailContent {
  const inviteUrl = buildInviteUrl(input.frontendOrigin, input.token);
  const subject = 'Activate your Personal Money Manager account';
  const text = [
    'You have been invited to Personal Money Manager.',
    '',
    `Open this link to set your password (expires in ${MAX_INVITE_EXPIRY_HOURS} hours):`,
    inviteUrl,
    '',
    'If you were not expecting this email, you can ignore it.',
  ].join('\n');

  const html = `
    <p>You have been invited to Personal Money Manager.</p>
    <p>
      <a href="${inviteUrl}">Activate your account</a>
      — this link expires in ${MAX_INVITE_EXPIRY_HOURS} hours.
    </p>
    <p>If the button does not work, paste this URL into your browser:</p>
    <p>${inviteUrl}</p>
    <p>If you were not expecting this email, you can ignore it.</p>
  `.trim();

  return { subject, html, text };
}
