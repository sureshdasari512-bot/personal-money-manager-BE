/**
 * Delivery contract for outbound email (Strategy pattern — Open/Closed).
 * Resend is the current implementation; another provider can be added later
 * without changing invitation or reminder services.
 */
export interface EmailChannel {
  send(input: { to: string; subject: string; html: string; text: string }): Promise<void>;
}

export interface InvitationEmailContent {
  subject: string;
  html: string;
  text: string;
}
