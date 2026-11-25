import { Resend } from "resend";
import type { EmailMessage, EmailProvider } from "../provider.js";

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  private readonly client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async send(message: EmailMessage): Promise<void> {
    const { data, error } = await this.client.emails.send({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (error) {
      throw new Error(`Resend send failed: ${error.message}`);
    }
    if (!data?.id) {
      throw new Error("Resend send failed: missing message id");
    }
  }
}
