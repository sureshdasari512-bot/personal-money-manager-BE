import type { InvitationEmailContent } from '../services/emailChannel.js';
import type { InterestPeriod, InterestReminderItem } from '../types/index.js';
import { escapeHtml, formatInr } from './emailFormat.js';
import { formatEmailDate } from './isoCalendar.js';

// ---------------------------------------------------------------------------
// Design tokens — must match the app's visual identity (same palette as
// dueReminderEmail.ts so every system email feels consistent).
// ---------------------------------------------------------------------------
const PRIMARY = '#1d4ed8';
const CANVAS = '#f4f6f9';
const SURFACE = '#ffffff';
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const SUCCESS = '#15803d';
const SUCCESS_SOFT = '#f0fdf4';
const WARNING = '#b45309';
const WARNING_SOFT = '#fffbeb';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Human-readable label for the interest period. */
function periodLabel(period: InterestPeriod): string {
  const labels: Record<InterestPeriod, string> = {
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    half_yearly: 'Half-yearly',
    yearly: 'Yearly',
  };
  return labels[period];
}

/** Formats basis points as a percentage string, e.g. 200 → "2.00%" */
function formatRateBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

export interface InterestReminderEmailInput {
  items: InterestReminderItem[];
  periodEndDate: string;
  frontendOrigin: string;
}

/**
 * Builds the periodic interest notification email for one user.
 * Sent at the end of each interest period (monthly, quarterly, etc.) to
 * inform the user how much interest has accrued across their active loans.
 *
 * Design follows the same table-based layout as dueReminderEmail so all
 * system emails look identical in structure.
 *
 * @param input - Items to include, the period end date, and the app origin
 * @returns Subject plus html/text bodies ready to enqueue
 */
export function buildInterestReminderEmail(
  input: InterestReminderEmailInput,
): InvitationEmailContent {
  const { items, periodEndDate, frontendOrigin } = input;
  const origin = frontendOrigin.replace(/\/$/, '');
  const dashboardUrl = `${origin}/dashboard`;

  const count = items.length;
  const totalInterestCents = items.reduce((sum, i) => sum + i.accruedInterestCents, 0);
  const countLabel = count === 1 ? '1 loan' : `${count} loans`;
  const periodLabel_ = items[0] ? periodLabel(items[0].interestPeriod) : 'Periodic';

  const subject = `${periodLabel_} interest posted — ${formatInr(totalInterestCents)} across ${countLabel}`;
  const headline = 'Interest has been posted';
  const preview = `${formatInr(totalInterestCents)} total interest accrued for the period ending ${formatEmailDate(periodEndDate)}.`;

  // ── Plain text ──────────────────────────────────────────────────────────
  const textLines = [
    headline,
    preview,
    '',
    ...items.map((item) => {
      const direction = item.type === 'lend' ? 'You lent' : 'You borrowed';
      return [
        `${item.personName} · ${direction} ${formatInr(item.amountCents)}`,
        `  Rate: ${formatRateBps(item.interestRateBps)}/month · Outstanding: ${formatInr(item.outstandingCents)}`,
        `  Interest this period: ${formatInr(item.accruedInterestCents)}`,
      ].join('\n');
    }),
    '',
    `Period end: ${formatEmailDate(periodEndDate)}`,
    `Open the dashboard: ${dashboardUrl}`,
    '',
    'You received this because you track these transactions in Personal Money Manager.',
    'The other person is not emailed.',
  ];

  // ── HTML rows ───────────────────────────────────────────────────────────
  const rows = items
    .map((item) => {
      const direction = item.type === 'lend' ? 'You lent' : 'You borrowed';
      const directionColor = item.type === 'lend' ? SUCCESS : WARNING;
      const ledgerUrl = `${origin}/people/${item.personId}`;

      return `
        <tr>
          <td style="padding:14px 16px;border-bottom:1px solid ${LINE};vertical-align:top;">
            <a href="${escapeHtml(ledgerUrl)}"
               style="color:${PRIMARY};font-weight:600;font-size:14px;text-decoration:none;">
              ${escapeHtml(item.personName)}
            </a>
            <p style="margin:4px 0 0 0;font-size:12px;font-weight:600;color:${directionColor};">
              ${direction}
            </p>
          </td>
          <td style="padding:14px 16px;border-bottom:1px solid ${LINE};font-size:13px;
                     color:${INK};vertical-align:top;text-align:right;white-space:nowrap;">
            ${escapeHtml(formatInr(item.amountCents))}
            <p style="margin:4px 0 0 0;font-size:12px;color:${MUTED};">
              Outstanding ${escapeHtml(formatInr(item.outstandingCents))}
            </p>
          </td>
          <td style="padding:14px 16px;border-bottom:1px solid ${LINE};font-size:13px;
                     color:${MUTED};vertical-align:top;text-align:right;white-space:nowrap;">
            ${escapeHtml(formatRateBps(item.interestRateBps))}/mo
          </td>
          <td style="padding:14px 16px;border-bottom:1px solid ${LINE};font-size:14px;
                     font-weight:700;color:${INK};vertical-align:top;text-align:right;
                     white-space:nowrap;">
            ${escapeHtml(formatInr(item.accruedInterestCents))}
          </td>
        </tr>`;
    })
    .join('');

  // ── Total row ───────────────────────────────────────────────────────────
  const totalRow = `
    <tr style="background:${CANVAS};">
      <td colspan="3" style="padding:12px 16px;font-size:13px;font-weight:600;color:${MUTED};">
        Total interest this period
      </td>
      <td style="padding:12px 16px;font-size:16px;font-weight:700;color:${INK};text-align:right;white-space:nowrap;">
        ${escapeHtml(formatInr(totalInterestCents))}
      </td>
    </tr>`;

  // ── Full HTML ───────────────────────────────────────────────────────────
  const html = `
    <div style="margin:0;padding:0;background:${CANVAS};font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
             style="background:${CANVAS};padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0"
                   style="max-width:600px;width:100%;">

              <!-- Logo -->
              <tr>
                <td style="padding:8px 8px 20px 8px;">
                  <span style="display:inline-block;background:${PRIMARY};color:#ffffff;
                               font-size:12px;font-weight:700;letter-spacing:0.04em;
                               padding:8px 12px;border-radius:12px;">PMM</span>
                </td>
              </tr>

              <!-- Card -->
              <tr>
                <td style="background:${SURFACE};border:1px solid ${LINE};border-radius:20px;
                           overflow:hidden;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">

                    <!-- Header -->
                    <tr>
                      <td style="padding:28px 24px 8px 24px;">
                        <p style="margin:0 0 8px 0;font-size:12px;font-weight:600;
                                  letter-spacing:0.08em;text-transform:uppercase;
                                  color:${PRIMARY};">Interest update</p>
                        <h1 style="margin:0 0 8px 0;font-size:24px;line-height:1.3;
                                   color:${INK};">${escapeHtml(headline)}</h1>
                        <p style="margin:0;font-size:15px;line-height:1.5;color:${MUTED};">
                          ${escapeHtml(preview)}
                        </p>
                      </td>
                    </tr>

                    <!-- Period badge -->
                    <tr>
                      <td style="padding:12px 24px 0 24px;">
                        <span style="display:inline-block;background:${SUCCESS_SOFT};
                                     color:${SUCCESS};font-size:12px;font-weight:600;
                                     padding:4px 10px;border-radius:99px;
                                     border:1px solid #bbf7d0;">
                          Period ending ${escapeHtml(formatEmailDate(periodEndDate))}
                        </span>
                      </td>
                    </tr>

                    <!-- Table -->
                    <tr>
                      <td style="padding:20px 24px 8px 24px;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                               style="border:1px solid ${LINE};border-radius:12px;overflow:hidden;">
                          <!-- Header row -->
                          <tr style="background:${CANVAS};">
                            <th align="left"
                                style="padding:10px 16px;font-size:11px;font-weight:600;
                                       letter-spacing:0.06em;text-transform:uppercase;
                                       color:${MUTED};">Person</th>
                            <th align="right"
                                style="padding:10px 16px;font-size:11px;font-weight:600;
                                       letter-spacing:0.06em;text-transform:uppercase;
                                       color:${MUTED};">Amount</th>
                            <th align="right"
                                style="padding:10px 16px;font-size:11px;font-weight:600;
                                       letter-spacing:0.06em;text-transform:uppercase;
                                       color:${MUTED};">Rate</th>
                            <th align="right"
                                style="padding:10px 16px;font-size:11px;font-weight:600;
                                       letter-spacing:0.06em;text-transform:uppercase;
                                       color:${MUTED};">Interest</th>
                          </tr>
                          ${rows}
                          ${totalRow}
                        </table>
                      </td>
                    </tr>

                    <!-- Info banner -->
                    <tr>
                      <td style="padding:0 24px 8px 24px;">
                        <div style="background:${WARNING_SOFT};border:1px solid #fde68a;
                                    border-radius:10px;padding:12px 16px;">
                          <p style="margin:0;font-size:13px;line-height:1.5;color:${WARNING};">
                            <strong>Note:</strong> Interest is calculated daily at
                            the monthly rate ÷ 30.&nbsp;
                            If the rate changed mid-period, each segment is calculated
                            separately at the rate that was active on those days.
                          </p>
                        </div>
                      </td>
                    </tr>

                    <!-- CTA -->
                    <tr>
                      <td style="padding:16px 24px 28px 24px;">
                        <a href="${escapeHtml(dashboardUrl)}"
                           style="display:inline-block;background:${PRIMARY};color:#ffffff;
                                  font-size:14px;font-weight:600;text-decoration:none;
                                  padding:12px 20px;border-radius:8px;">
                          View full ledger
                        </a>
                        <p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;
                                  color:${MUTED};">
                          If the button does not work, paste this into your browser:<br/>
                          ${escapeHtml(dashboardUrl)}
                        </p>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding:16px 8px 0 8px;font-size:12px;line-height:1.5;
                           color:${MUTED};">
                  You received this because you track these transactions in
                  Personal Money Manager. We do not email the other person.
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
