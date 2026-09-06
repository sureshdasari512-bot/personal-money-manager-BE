import { AppError } from '../types/index.js';

interface ResendLikeError {
  message?: string;
  name?: string;
  statusCode?: number | null;
}

/**
 * Maps a Resend API error onto the shared client error envelope.
 * Domain/from problems are global; recipient restrictions are field errors.
 *
 * @param error - Resend SDK error object
 * @returns AppError safe to return to the client
 */
export function mapResendError(error: ResendLikeError): AppError {
  const raw = (error.message ?? '').trim();
  const lower = raw.toLowerCase();

  if (lower.includes('domain is not verified') || lower.includes('verify your domain')) {
    return new AppError(
      raw ||
        'The sending address is not verified in Resend. Use beth.t@example.com until you add a domain.',
      400,
    );
  }

  if (
    lower.includes('only send testing emails') ||
    lower.includes('you can only send') ||
    lower.includes('invalid `to`')
  ) {
    return new AppError(
      raw || 'This recipient cannot receive test email from Resend.',
      400,
      { email: raw || 'Resend test mode can only send to your Resend account email.' },
    );
  }

  if (lower.includes('api key') || lower.includes('unauthorized')) {
    return new AppError('Email service rejected the API key. Check RESEND_API_KEY.', 503);
  }

  return new AppError(raw || 'Could not send the invitation email', error.statusCode ?? 502);
}
