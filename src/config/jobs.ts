/**
 * Redis catalog: BullMQ queues/jobs and rate-limit keys.
 * Rate-limit counters are not jobs — they must not live under the `bull:` prefix.
 */

export const EMAIL_JOB = {
  queueName: 'email',
  names: {
    invitation: 'invitation',
    accountReady: 'account-ready',
    dueReminder: 'due-reminder',
    passwordReset: 'password-reset',
  },
} as const;

export type EmailJobName = (typeof EMAIL_JOB.names)[keyof typeof EMAIL_JOB.names];

export const DUE_REMINDER_JOB = {
  queueName: 'due-reminders',
  schedulerId: 'due-reminder-daily',
  name: 'scan',
  pattern: '0 8 * * *',
  tz: 'Asia/Kolkata',
} as const;

export const REDIS_RATE_LIMIT_PREFIX = {
  loginAttempts: 'login-attempts',
  passwordResetRequests: 'password-reset-requests',
} as const;

/**
 * Builds the Redis key for failed logins on one email.
 *
 * @param email - Login email
 * @returns `login-attempts:{email}`
 */
export function loginAttemptsKey(email: string): string {
  return `${REDIS_RATE_LIMIT_PREFIX.loginAttempts}:${email.trim().toLowerCase()}`;
}

/**
 * Builds the Redis key for forgot-password requests on one email.
 *
 * @param email - Request email
 * @returns `password-reset-requests:{email}`
 */
export function passwordResetRequestsKey(email: string): string {
  return `${REDIS_RATE_LIMIT_PREFIX.passwordResetRequests}:${email.trim().toLowerCase()}`;
}
