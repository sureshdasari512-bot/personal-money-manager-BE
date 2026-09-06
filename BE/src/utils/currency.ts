/**
 * Converts a major-unit amount (rupees/dollars) to the smallest currency unit.
 * Money is stored as integers — never floats — per the SRS data-integrity NFR.
 *
 * @param majorUnits - Amount in major currency units
 * @returns Amount in cents/paise, rounded to the nearest integer
 */
export function toCents(majorUnits: number): number {
  return Math.round(majorUnits * 100);
}

/**
 * Converts the smallest currency unit back to a major-unit number for display.
 *
 * @param cents - Amount in cents/paise
 * @returns Amount in major units
 */
export function fromCents(cents: number): number {
  return cents / 100;
}
