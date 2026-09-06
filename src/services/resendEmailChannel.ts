import { Resend } from 'resend';
import { env } from '../config/env.js';
import { AppError } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { mapResendError } from '../utils/resendError.js';
import type { EmailChannel } from './emailChannel.js';

/**
 * Sends mail through Resend. Invitation and reminder services depend on
 * EmailChannel, not this class (Dependency Inversion).
 */
export class ResendEmailChannel implements EmailChannel {
  private readonly client: Resend;

  /**
   * @param apiKey - Resend API key; defaults to env
   */
  constructor(apiKey: string = env.resendApiKey) {
    this.client = new Resend(apiKey);
  }

  /**
   * Delivers one transactional email.
   *
   * @param input - Recipient and message
   * @throws {AppError} If Resend rejects the send, with a client-safe reason
   */
  async send(input: { to: string; subject: string; html: string; text: string }): Promise<void> {
    try {
      const { data, error } = await this.client.emails.send({
        from: env.emailFrom,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });

      if (error) {
        logger.error({ err: error, to: input.to, from: env.emailFrom }, 'Resend rejected the email');
        throw mapResendError(error);
      }

      logger.info({ to: input.to, emailId: data?.id }, 'Email sent via Resend');
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      logger.error({ err, to: input.to, from: env.emailFrom }, 'Resend send threw');
      throw mapResendError(err instanceof Error ? err : { message: 'Could not send the invitation email' });
    }
  }
}

/**
 * Returns the configured email channel. Swap this factory to change providers.
 *
 * @returns EmailChannel implementation
 * @throws {AppError} If RESEND_API_KEY is missing
 */
export function getEmailChannel(): EmailChannel {
  if (!env.resendApiKey) {
    throw new AppError('Email service is not configured. Set RESEND_API_KEY.', 503);
  }
  return new ResendEmailChannel();
}
