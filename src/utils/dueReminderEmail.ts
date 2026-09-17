import type { InvitationEmailContent } from '../services/emailChannel.js';
import type { DueReminderItem, DueReminderWindow } from '../types/index.js';
import { escapeHtml, formatInr } from './emailFormat.js';
import { formatEmailDate } from './isoCalendar.js';
import { DUE_REMINDER_WINDOWS } from './dueReminderWindows.js';

const PRIMARY = '#1d4ed8';
const CANVAS = '#f4f6f9';
const SURFACE = '#ffffff';
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const WARNING = '#b45309';

interface DueReminderEmailInput {
  window: DueReminderWindow;
  items: DueReminderItem[];
  frontendOrigin: string;
}

/**
 * Builds a digest reminder for one user and one window (T-2, T-1, or due day).
 * Copy answers: where you are, what is due, what to do next.
 *
 * @param input - Window, outstanding items, and app origin
 * @returns Subject plus html/text bodies
 */
export function buildDueReminderEmail(input: DueReminderEmailInput): InvitationEmailContent {
  const spec = DUE_REMINDER_WINDOWS.find((entry) => entry.window === input.window);
  const headline = spec?.headline ?? 'Upcoming due date';
  const preview = spec?.preview ?? 'You have repayments coming due.';
  const origin = input.frontendOrigin.replace(/\/$/, '');
  const count = input.items.length;
  const countLabel = count === 1 ? '1 repayment' : `${count} repayments`;
  const subject = `${headline} — ${countLabel}`;
  const dashboardUrl = `${origin}/dashboard`;

  const textLines = [
    headline,
    preview,
    '',
    ...input.items.map((item) => {
      const side = item.type === 'lend' ? 'They owe you' : 'You owe them';
      return `${item.personName} · ${side} · ${formatInr(item.outstandingCents)} · Due ${formatEmailDate(item.dueDate)}`;
    }),
    '',
    `Open the dashboard: ${dashboardUrl}`,
    '',
    'You received this because you track this person in Personal Money Manager. The other person is not emailed.',
  ];

  const rows = input.items
    .map((item) => {
      const side = item.type === 'lend' ? 'They owe you' : 'You owe them';
      const ledgerUrl = `${origin}/people/${item.personId}`;
      const accent = item.type === 'lend' ? PRIMARY : WARNING;
      return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid ${LINE};font-size:14px;color:${INK};">
            <a href="${escapeHtml(ledgerUrl)}" style="color:${PRIMARY};font-weight:600;text-decoration:none;">${escapeHtml(item.personName)}</a>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid ${LINE};font-size:13px;color:${accent};font-weight:600;">${side}</td>
          <td style="padding:12px 16px;border-bottom:1px solid ${LINE};font-size:14px;color:${INK};font-weight:600;text-align:right;">${escapeHtml(formatInr(item.outstandingCents))}</td>
          <td style="padding:12px 16px;border-bottom:1px solid ${LINE};font-size:13px;color:${MUTED};text-align:right;white-space:nowrap;">${escapeHtml(formatEmailDate(item.dueDate))}</td>
        </tr>`;
    })
    .join('');

  const html = `
    <div style="margin:0;padding:0;background:${CANVAS};font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
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
                <td style="background:${SURFACE};border:1px solid ${LINE};border-radius:20px;overflow:hidden;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="padding:28px 24px 8px 24px;">
                        <p style="margin:0 0 8px 0;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${PRIMARY};">Reminder</p>
                        <h1 style="margin:0 0 8px 0;font-size:24px;line-height:1.3;color:${INK};">${escapeHtml(headline)}</h1>
                        <p style="margin:0;font-size:15px;line-height:1.5;color:${MUTED};">${escapeHtml(preview)}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:20px 24px 8px 24px;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid ${LINE};border-radius:12px;overflow:hidden;">
                          <tr style="background:${CANVAS};">
                            <th align="left" style="padding:10px 16px;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">Person</th>
                            <th align="left" style="padding:10px 16px;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">Side</th>
                            <th align="right" style="padding:10px 16px;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">Outstanding</th>
                            <th align="right" style="padding:10px 16px;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">Due</th>
                          </tr>
                          ${rows}
                        </table>
                      </td>
                    </tr>
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
              <tr>
                <td style="padding:16px 8px 0 8px;font-size:12px;line-height:1.5;color:${MUTED};">
                  You received this because you track these people in Personal Money Manager. We do not email the other person.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `.trim();

  return { subject, html, text: textLines.join('\n') };
}
