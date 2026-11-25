/** Low-level transport. Swap Resend for Brevo/SES/etc. without touching auth. */
export type EmailMessage = {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}
