/**
 * Delivery contract for outbound email (Strategy pattern — Open/Closed).
 * Gmail SMTP via Nodemailer is the current implementation; the BullMQ worker
 * is the only caller. Another provider can be added without changing services.
 */
export interface EmailChannel {
  send(input: { to: string; subject: string; html: string; text: string }): Promise<void>;
}

export interface InvitationEmailContent {
  subject: string;
  html: string;
  text: string;
}
