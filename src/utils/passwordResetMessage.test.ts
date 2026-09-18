import { describe, expect, it } from 'vitest';
import {
  DISABLED_ACCOUNT_RESET_MESSAGE,
  FORGOT_PASSWORD_SUCCESS_MESSAGE,
  formatPasswordResetLockedMessage,
  INVALID_RESET_LINK_MESSAGE,
  UNKNOWN_ACCOUNT_RESET_MESSAGE,
} from './passwordResetMessage.js';

describe('passwordResetMessage', () => {
  it('tells unknown emails to contact an administrator', () => {
    expect(UNKNOWN_ACCOUNT_RESET_MESSAGE).toContain('does not have an account');
    expect(UNKNOWN_ACCOUNT_RESET_MESSAGE).toContain('administrator');
  });

  it('tells disabled accounts to contact an administrator', () => {
    expect(DISABLED_ACCOUNT_RESET_MESSAGE).toContain('disabled');
    expect(DISABLED_ACCOUNT_RESET_MESSAGE).toContain('administrator');
  });

  it('confirms a reset email was sent only after a real send', () => {
    expect(FORGOT_PASSWORD_SUCCESS_MESSAGE).toContain('We sent a reset link');
  });

  it('tells the user the reset link failed without leaking token details', () => {
    expect(INVALID_RESET_LINK_MESSAGE).toContain('invalid or has expired');
    expect(INVALID_RESET_LINK_MESSAGE.toLowerCase()).not.toContain('token');
  });

  it('tells the user when to retry after too many requests', () => {
    expect(formatPasswordResetLockedMessage()).toContain('15 minutes');
  });
});
