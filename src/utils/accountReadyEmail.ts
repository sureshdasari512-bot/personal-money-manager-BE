import type { InvitationEmailContent } from '../services/emailChannel.js';
import { escapeHtml } from './emailFormat.js';

const PRIMARY = '#1d4ed8';
const SUCCESS = '#15803d';
const SUCCESS_SOFT = '#f0fdf4';
const CANVAS = '#f4f6f9';
const SURFACE = '#ffffff';
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';

/**
 * Builds the email sent after an invitee sets a password and is signed in.
 *
 * @param input - Frontend origin used for the app link
 * @returns Subject plus html/text bodies
 */
export function buildAccountReadyEmail(input: { frontendOrigin: string }): InvitationEmailContent {
  const origin = input.frontendOrigin.replace(/\/$/, '');
  const dashboardUrl = `${origin}/dashboard`;
  const subject = 'You are signed in to Personal Money Manager';
  const preview = 'Your account is ready. Open the app to start tracking your money.';

  const text = [
    'You have successfully signed in to your Personal Money Manager account.',
    '',
    `Open the app: ${dashboardUrl}`,
    '',
    'If you did not just set your password, contact your administrator.',
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
                        <p style="margin:0 0 8px 0;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${SUCCESS};">Account ready</p>
                        <h1 style="margin:0 0 8px 0;font-size:24px;line-height:1.3;color:${INK};">You are signed in</h1>
                        <p style="margin:0;font-size:15px;line-height:1.5;color:${MUTED};">
                          Your Personal Money Manager account is set up and ready to use.
                        </p>
                      </td>
                    </tr>

                    <!-- Success badge -->
                    <tr>
                      <td style="padding:12px 24px 0 24px;">
                        <span style="display:inline-block;background:${SUCCESS_SOFT};color:${SUCCESS};font-size:12px;font-weight:600;padding:4px 10px;border-radius:99px;border:1px solid #bbf7d0;">
                          Password set successfully
                        </span>
                      </td>
                    </tr>

                    <!-- CTA -->
                    <tr>
                      <td style="padding:24px;">
                        <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:${PRIMARY};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:8px;">Open dashboard</a>
                        <p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;color:${MUTED};">
                          If the button does not work, paste this URL into your browser:<br/>
                          ${escapeHtml(dashboardUrl)}
                        </p>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding:16px 8px 0 8px;font-size:12px;line-height:1.5;color:${MUTED};">
                  If you did not just set your password, contact your administrator immediately.
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
