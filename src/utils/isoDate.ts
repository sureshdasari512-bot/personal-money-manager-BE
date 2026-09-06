/**
 * Normalizes a DATE column to `YYYY-MM-DD` so timezone shifts do not change the day.
 *
 * @param value - Driver date or ISO string
 * @returns Calendar date string
 */
export function toIsoDate(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
