import type { EmailMessage, EmailProvider } from "../provider.js";

/** Captures outbound provider messages (tests / offline). */
export class MemoryEmailProvider implements EmailProvider {
  readonly name = "memory";
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}
