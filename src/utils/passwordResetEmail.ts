import { PASSWORD_RESET_EXPIRY_HOURS } from '../config/env.js';
import type { InvitationEmailContent } from '../services/emailChannel.js';
import { escapeHtml } from './emailFormat.js';

/** Matches FE `tokens` in lib/design-tokens.ts so mail and app look like one product. */
const PRIMARY = '#1d4ed8';
const PRIMARY_SOFT = '#eff6ff';
const CANVAS = '#f4f6f9';
const SURFACE = '#ffffff';
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const RADIUS = '20px';
const RADIUS_SM = '8px';

/**
 * Builds the reset-password URL the user opens from email.
 *
 * @param frontendOrigin - Frontend origin with no trailing slash
 * @param token - Opaque reset token
 * @returns Reset URL
 */
export function buildPasswordResetUrl(frontendOrigin: string, token: string): string {
  const origin = frontendOrigin.replace(/\/$/, '');
  return `${origin}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Builds the password-reset email. Copy answers: where you are, what happened, what to do next.
 *
 * @param input - Token and frontend origin
 * @returns Subject plus html/text bodies
 */
export function buildPasswordResetEmail(input: {
  token: string;
  frontendOrigin: string;
}): InvitationEmailContent {
  const resetUrl = buildPasswordResetUrl(input.frontendOrigin, input.token);
  const hoursLabel = PASSWORD_RESET_EXPIRY_HOURS === 1 ? '1 hour' : `${PASSWORD_RESET_EXPIRY_HOURS} hours`;
  const subject = 'Reset your Personal Money Manager password';
  const preview = `We received a password reset request. This link expires in ${hoursLabel}.`;
  const text = [
    'Personal Money Manager — password reset',
    '',
    preview,
    '',
    'What to do next:',
    '1. Open the reset link below.',
    '2. Choose a new password (at least 8 characters).',
    '3. You will be signed in on this device. Other devices are signed out.',
    '',
    `Reset password (expires in ${hoursLabel}):`,
    resetUrl,
    '',
    'If you did not ask to reset your password, ignore this email. Your password will not change.',
  ].join('\n');

  const html = `
    <div style="margin:0;padding:0;background:${CANVAS};font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
      <span style="display:none;max-height:0;overflow:hidden;color:${CANVAS};">${escapeHtml(preview)}</span>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${CANVAS};padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;">
              <tr>
                <td style="padding:8px 8px 20px 8px;">
                  <span style="display:inline-block;background:${PRIMARY};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.04em;padding:8px 12px;border-radius:12px;">PMM</span>
                </td>
              </tr>
              <tr>
                <td style="background:${SURFACE};border:1px solid ${LINE};border-radius:${RADIUS};overflow:hidden;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="padding:28px 24px 8px 24px;">
                        <p style="margin:0 0 8px 0;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${PRIMARY};">Password reset</p>
                        <h1 style="margin:0 0 8px 0;font-size:24px;line-height:1.3;color:${INK};">Reset your password</h1>
                        <p style="margin:0;font-size:15px;line-height:1.5;color:${MUTED};">${escapeHtml(preview)}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:20px 24px 8px 24px;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${PRIMARY_SOFT};border-radius:12px;">
                          <tr>
                            <td style="padding:12px 16px;font-size:13px;line-height:1.5;color:${INK};">
                              This link expires in <strong>${escapeHtml(hoursLabel)}</strong>. After you save a new password, other signed-in devices are logged out.
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 24px 0 24px;">
                        <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:${INK};">What to do next</p>
                        <p style="margin:0;font-size:14px;line-height:1.6;color:${MUTED};">
                          1. Tap the button below.<br/>
                          2. Choose a new password (at least 8 characters).<br/>
                          3. Continue in Personal Money Manager.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:24px;">
                        <a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:${PRIMARY};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:${RADIUS_SM};">Reset password</a>
                        <p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;color:${MUTED};">
                          If the button does not work, paste this URL into your browser:<br/>
                          ${escapeHtml(resetUrl)}
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 8px 0 8px;font-size:12px;line-height:1.5;color:${MUTED};">
                  If you did not ask to reset your password, ignore this email. Your password will not change.
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
