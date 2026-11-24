export type MailTemplate = "verify_email" | "reset_password" | "already_registered";

export interface Mailer {
  send(msg: { to: string; template: MailTemplate; token?: string }): Promise<void>;
}

/** Captures messages in memory (tests / local dev). Replace with SES/Postmark in prod. */
export class MemoryMailer implements Mailer {
  readonly outbox: { to: string; template: MailTemplate; token?: string }[] = [];

  async send(msg: { to: string; template: MailTemplate; token?: string }): Promise<void> {
    this.outbox.push(msg);
  }

  lastTokenFor(to: string, template: MailTemplate): string | undefined {
    for (let i = this.outbox.length - 1; i >= 0; i--) {
      const m = this.outbox[i]!;
      if (m.to === to && m.template === template) return m.token;
    }
    return undefined;
  }
}
