import { describe, expect, it } from 'vitest';
import { hashToken } from './tokenHash.js';

describe('hashToken', () => {
  it('returns a stable 64-character hex digest', () => {
    const hash = hashToken('refresh-token');
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashToken('refresh-token'));
    expect(hash).not.toBe(hashToken('other-token'));
  });
});
