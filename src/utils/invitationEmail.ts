import { MAX_INVITE_EXPIRY_HOURS } from '../config/env.js';
import type { InvitationEmailContent } from '../services/emailChannel.js';
import { escapeHtml } from './emailFormat.js';

const PRIMARY = '#1d4ed8';
const PRIMARY_SOFT = '#eff6ff';
const CANVAS = '#f4f6f9';
const SURFACE = '#ffffff';
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';

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
  const preview = `You have been invited to Personal Money Manager. Set your password to get started.`;
  const hoursLabel = `${MAX_INVITE_EXPIRY_HOURS} hours`;

  const text = [
    'You have been invited to Personal Money Manager.',
    '',
    `Open this link to set your password (expires in ${hoursLabel}):`,
    inviteUrl,
    '',
    'If you were not expecting this email, you can ignore it.',
  ].join('\n');

  const html = `
    <div style="margin:0;padding:0;background:${CANVAS};font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
      <span style="display:none;max-height:0;overflow:hidden;color:${CANVAS};">${escapeHtml(preview)}</span>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${CANVAS};padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;">

              <!-- Logo -->
              <tr>
                <td style="padding:8px 8px 20px 8px;">
                  <span style="display:inline-block;background:${PRIMARY};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.04em;padding:8px 12px;border-radius:12px;">PMM</span>
                </td>
              </tr>

              <!-- Card -->
              <tr>
                <td style="background:${SURFACE};border:1px solid ${LINE};border-radius:20px;overflow:hidden;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">

                    <!-- Header -->
                    <tr>
                      <td style="padding:28px 24px 8px 24px;">
                        <p style="margin:0 0 8px 0;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${PRIMARY};">Invitation</p>
                        <h1 style="margin:0 0 8px 0;font-size:24px;line-height:1.3;color:${INK};">You have been invited</h1>
                        <p style="margin:0;font-size:15px;line-height:1.5;color:${MUTED};">
                          Set your password to start using Personal Money Manager.
                        </p>
                      </td>
                    </tr>

                    <!-- Info box -->
                    <tr>
                      <td style="padding:20px 24px 8px 24px;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${PRIMARY_SOFT};border-radius:12px;">
                          <tr>
                            <td style="padding:12px 16px;font-size:13px;line-height:1.5;color:${INK};">
                              This invite link expires in <strong>${escapeHtml(hoursLabel)}</strong>. After that you will need a new invitation from your admin.
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- CTA -->
                    <tr>
                      <td style="padding:24px;">
                        <a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:${PRIMARY};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:8px;">Activate your account</a>
                        <p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;color:${MUTED};">
                          If the button does not work, paste this URL into your browser:<br/>
                          ${escapeHtml(inviteUrl)}
                        </p>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding:16px 8px 0 8px;font-size:12px;line-height:1.5;color:${MUTED};">
                  If you were not expecting this invitation, you can ignore this email.
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </div>
  `.trim();

  return { subject, html, text };
}
