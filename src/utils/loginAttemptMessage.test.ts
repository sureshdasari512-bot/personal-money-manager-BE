import { describe, expect, it } from 'vitest';
import { formatLoginAttemptMessage } from './loginAttemptMessage.js';

describe('formatLoginAttemptMessage', () => {
  it('shows remaining attempts after the first failure', () => {
    expect(formatLoginAttemptMessage(1)).toBe(
      'Invalid email or password. 1st attempt done. 2 more attempts left.',
    );
  });

  it('shows one attempt left after the second failure', () => {
    expect(formatLoginAttemptMessage(2)).toBe(
      'Invalid email or password. 2nd attempt done. 1 more attempt left.',
    );
  });

  it('locks after the third failure', () => {
    expect(formatLoginAttemptMessage(3)).toContain('Too many login attempts');
  });
});
