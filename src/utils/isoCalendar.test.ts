import { describe, expect, it } from 'vitest';
import { addIsoDays, formatEmailDate } from './isoCalendar.js';

describe('addIsoDays', () => {
  it('adds two days for the T-2 reminder window', () => {
    expect(addIsoDays('2026-09-18', 2)).toBe('2026-09-20');
  });

  it('crosses month boundaries', () => {
    expect(addIsoDays('2026-09-30', 1)).toBe('2026-10-01');
  });
});

describe('formatEmailDate', () => {
  it('formats a calendar date without shifting the day', () => {
    expect(formatEmailDate('2026-09-20')).toContain('20');
    expect(formatEmailDate('2026-09-20')).toContain('2026');
  });
});
