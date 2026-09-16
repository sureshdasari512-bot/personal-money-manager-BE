import { AppError } from '../types/index.js';

interface SmtpLikeError {
  message?: string;
  code?: string;
}

/**
 * Maps a Nodemailer/SMTP failure onto the shared client error envelope.
 * Auth and connectivity problems are 503; other send failures are 502.
 *
 * @param error - Unknown throw from Nodemailer
 * @returns AppError safe to return to the client
 */
export function mapSmtpError(error: unknown): AppError {
  const err = asSmtpError(error);
  const raw = (err.message ?? '').trim();
  const code = (err.code ?? '').toUpperCase();
  const lower = raw.toLowerCase();

  if (
    code === 'EAUTH' ||
    lower.includes('invalid login') ||
    lower.includes('username and password not accepted') ||
    lower.includes('badcredentials') ||
    lower.includes('application-specific password')
  ) {
    return new AppError(
      'Email service rejected the SMTP login. Check SMTP_USER and SMTP_PASS (use a Gmail App Password).',
      503,
    );
  }

  if (
    code === 'ECONNECTION' ||
    code === 'ETIMEDOUT' ||
    code === 'ESOCKET' ||
    code === 'EDNS' ||
    code === 'EENVELOPE'
  ) {
    return new AppError('Could not reach the mail server. Check SMTP_HOST and SMTP_PORT.', 503);
  }

  return new AppError(raw || 'Could not send the invitation email', 502);
}

/**
 * Narrows an unknown throw to message/code fields Nodemailer typically sets.
 *
 * @param error - Caught value
 * @returns SMTP-like error fields
 */
function asSmtpError(error: unknown): SmtpLikeError {
  if (error instanceof Error) {
    const withCode = error as Error & { code?: string };
    return withCode.code !== undefined
      ? { message: withCode.message, code: withCode.code }
      : { message: withCode.message };
  }
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    const result: SmtpLikeError = {};
    if (typeof record.message === 'string') {
      result.message = record.message;
    }
    if (typeof record.code === 'string') {
      result.code = record.code;
    }
    return result;
  }
  return {};
}
