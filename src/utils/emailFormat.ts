/**
 * Formats integer cents as INR for email and logs. Never format raw floats.
 *
 * @param amountCents - Amount in paise/cents
 * @returns Localized rupee string
 */
export function formatInr(amountCents: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

/**
 * Escapes text for HTML email bodies.
 *
 * @param value - Untrusted string
 * @returns Safe HTML text
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
