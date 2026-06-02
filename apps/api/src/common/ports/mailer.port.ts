/** Outbound email port (§14.5). Dev uses Mailhog; prod uses real SMTP. */
export interface MailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface MailerPort {
  send(message: MailMessage): Promise<void>;
}

/** DI token for the Mailer port. */
export const MAILER = Symbol('MAILER');

/** No-op dev adapter — logs instead of sending. M0 wires a real SMTP adapter. */
export const noopMailer: MailerPort = {
  async send(message: MailMessage): Promise<void> {
    console.log(`[mailer:noop] would send "${message.subject}" to ${message.to}`);
  },
};
