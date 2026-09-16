import type { InvitationEmailContent } from '../services/emailChannel.js';

/**
 * Builds the email sent after an invitee sets a password and is signed in.
 *
 * @param input - Frontend origin used for the app link
 * @returns Subject plus html/text bodies
 */
export function buildAccountReadyEmail(input: { frontendOrigin: string }): InvitationEmailContent {
  const origin = input.frontendOrigin.replace(/\/$/, '');
  const subject = 'You have successfully signed in to Personal Money Manager';
  const text = [
    'You have successfully signed in to your Personal Money Manager account.',
    '',
    `Open the app: ${origin}`,
    '',
    'If you did not just set your password, contact your administrator.',
  ].join('\n');

  const html = `
    <p>You have successfully signed in to your Personal Money Manager account.</p>
    <p><a href="${origin}">Open the app</a></p>
    <p>If you did not just set your password, contact your administrator.</p>
  `.trim();

  return { subject, html, text };
}
