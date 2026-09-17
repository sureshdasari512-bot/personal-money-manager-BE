/**
 * Returns today's calendar date in a named timezone as YYYY-MM-DD.
 * Postgres CURRENT_DATE follows the DB server TZ (Singapore on Supabase).
 *
 * @param timeZone - IANA timezone (default Asia/Kolkata)
 * @param now - Optional clock for tests
 * @returns Calendar date
 */
export function todayIsoInTimeZone(
  timeZone: string = 'Asia/Kolkata',
  now: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error('Could not resolve calendar date for timezone');
  }
  return `${year}-${month}-${day}`;
}

/**
 * Adds whole days to a YYYY-MM-DD calendar date without local TZ shifts.
 *
 * @param isoDate - Calendar date
 * @param days - Days to add (may be negative)
 * @returns Resulting calendar date
 */
export function addIsoDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) {
    throw new Error(`Invalid calendar date: ${isoDate}`);
  }
  const utc = Date.UTC(year, month - 1, day + days);
  return new Date(utc).toISOString().slice(0, 10);
}

/**
 * Formats a calendar date for email copy (e.g. 18 Sep 2026).
 *
 * @param isoDate - YYYY-MM-DD
 * @returns Display date
 */
export function formatEmailDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
