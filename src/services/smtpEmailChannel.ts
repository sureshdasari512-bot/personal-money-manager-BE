import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { AppError } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { mapSmtpError } from '../utils/smtpError.js';
import type { EmailChannel } from './emailChannel.js';

/**
 * Sends mail through SMTP (Gmail via Nodemailer). Invitation and reminder
 * services depend on EmailChannel, not this class (Dependency Inversion).
 */
export class SmtpEmailChannel implements EmailChannel {
  private readonly transporter: Transporter;
  private readonly from: string;

  /**
   * @param transporter - Optional injected transporter for tests
   * @param from - From header; defaults to EMAIL_FROM or SMTP_USER
   */
  constructor(transporter?: Transporter, from: string = env.emailFrom || env.smtpUser) {
    this.transporter = transporter ?? createSmtpTransporter();
    this.from = from;
  }

  /**
   * Delivers one transactional email.
   *
   * @param input - Recipient and message
   * @throws {AppError} If SMTP rejects the send, with a client-safe reason
   */
  async send(input: { to: string; subject: string; html: string; text: string }): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      logger.info({ to: input.to, messageId: info.messageId }, 'Email sent via SMTP');
    } catch (err) {
      logger.error({ err, to: input.to, from: this.from }, 'SMTP send failed');
      throw mapSmtpError(err);
    }
  }
}

/**
 * Builds a Gmail SMTP transporter from env. Password is never logged.
 *
 * @returns Nodemailer transporter
 */
function createSmtpTransporter(): Transporter {
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });
}

/**
 * Returns the configured Gmail SMTP email channel.
 *
 * @returns EmailChannel implementation
 * @throws {AppError} If SMTP_USER or SMTP_PASS is missing
 */
export function getEmailChannel(): EmailChannel {
  if (!env.smtpUser || !env.smtpPass) {
    throw new AppError('Email service is not configured. Set SMTP_USER and SMTP_PASS.', 503);
  }
  return new SmtpEmailChannel();
}

/**
 * Checks SMTP login at boot and logs the result (host/user only).
 * Does not throw, so a mail outage does not block the rest of the API.
 */
export async function verifySmtpConnection(): Promise<void> {
  if (!env.smtpUser || !env.smtpPass) {
    logger.warn('SMTP not configured. Set SMTP_USER and SMTP_PASS.');
    return;
  }

  const target = { host: env.smtpHost, port: env.smtpPort, user: env.smtpUser };
  const transporter = createSmtpTransporter();
  try {
    await transporter.verify();
    logger.info(target, 'SMTP connected');
  } catch (err) {
    logger.error({ err, ...target }, 'SMTP connection failed');
  } finally {
    transporter.close();
  }
}
