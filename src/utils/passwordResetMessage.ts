export const MAX_PASSWORD_RESET_REQUESTS = 3;
export const PASSWORD_RESET_WINDOW_MINUTES = 15;

export const FORGOT_PASSWORD_SUCCESS_MESSAGE =
  'We sent a reset link to that email. Check your inbox.';

export const UNKNOWN_ACCOUNT_RESET_MESSAGE =
  'This email does not have an account. Contact your administrator.';

export const DISABLED_ACCOUNT_RESET_MESSAGE =
  'This account is disabled. Contact your administrator.';

export const INVALID_RESET_LINK_MESSAGE =
  'This reset link is invalid or has expired. Request a new one from the sign-in page.';

/**
 * Builds the client-facing lock message after too many reset requests.
 *
 * @returns Global 429 copy
 */
export function formatPasswordResetLockedMessage(): string {
  return `Too many password reset requests. Try again in ${PASSWORD_RESET_WINDOW_MINUTES} minutes.`;
}

