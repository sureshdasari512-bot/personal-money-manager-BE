import { describe, expect, it } from 'vitest';
import { escapeHtml, formatInr } from './emailFormat.js';

describe('formatInr', () => {
  it('formats integer cents as rupees', () => {
    expect(formatInr(150050)).toContain('1,500.50');
  });
});

describe('escapeHtml', () => {
  it('escapes markup in person names', () => {
    expect(escapeHtml('Ram <script>')).toBe('Ram &lt;script&gt;');
  });
});
