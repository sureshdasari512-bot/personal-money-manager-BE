export const MAX_LOGIN_ATTEMPTS = 3;
export const LOGIN_ATTEMPT_WINDOW_MINUTES = 15;

/**
 * Builds the client-facing login-attempt copy.
 *
 * @param failedCount - Failed tries in the current window (1..MAX)
 * @returns Status line for the login form
 */
export function formatLoginAttemptMessage(failedCount: number): string {
  const remaining = MAX_LOGIN_ATTEMPTS - failedCount;
  if (remaining <= 0) {
    return `Too many login attempts. Try again in ${LOGIN_ATTEMPT_WINDOW_MINUTES} minutes.`;
  }
  const ordinal = toOrdinal(failedCount);
  const left = remaining === 1 ? '1 more attempt left' : `${remaining} more attempts left`;
  return `Invalid email or password. ${ordinal} attempt done. ${left}.`;
}

/**
 * Converts 1, 2, 3 to 1st, 2nd, 3rd.
 *
 * @param value - Positive integer
 * @returns Ordinal label
 */
function toOrdinal(value: number): string {
  if (value === 1) {
    return '1st';
  }
  if (value === 2) {
    return '2nd';
  }
  if (value === 3) {
    return '3rd';
  }
  return `${value}th`;
}
