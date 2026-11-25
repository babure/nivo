import type { AppConfig } from "../config.js";
import { renderMailTemplate, type MailTemplateVars } from "./email/templates.js";
import type { EmailProvider } from "./email/provider.js";
import { MemoryEmailProvider } from "./email/providers/memory.js";
import { ResendEmailProvider } from "./email/providers/resend.js";

export type MailTemplate =
  | "verify_email"
  | "reset_password"
  | "already_registered"
  | "welcome"
  | "pay_receipt"
  | "sim_unlocked"
  | "accommodation_lead"
  | "accommodation_enquiry_received"
  | "coming_soon_notify"
  | "withdrawal_ack";

export type OutboundMail = {
  to: string;
  template: MailTemplate;
  token?: string;
  vars?: MailTemplateVars;
};

export interface Mailer {
  send(msg: OutboundMail): Promise<void>;
}

/**
 * Domain mailer: renders auth templates, then hands off to an EmailProvider
 * (Resend today; Brevo/SES/etc. later via createEmailProvider).
 */
export class TemplateMailer implements Mailer {
  constructor(
    private readonly provider: EmailProvider,
    private readonly opts: { appUrl: string; from: string },
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  async send(msg: OutboundMail): Promise<void> {
    const rendered = renderMailTemplate(msg.template, {
      appUrl: this.opts.appUrl,
      token: msg.token,
      vars: msg.vars,
    });
    await this.provider.send({
      to: msg.to,
      from: this.opts.from,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }
}

/**
 * In-memory mailer for unit/integration tests (exposes tokens without a provider).
 * Prefer TemplateMailer + MemoryEmailProvider when you need rendered content.
 */
export class MemoryMailer implements Mailer {
  readonly outbox: OutboundMail[] = [];

  async send(msg: OutboundMail): Promise<void> {
    this.outbox.push(msg);
  }

  lastFor(to: string, template?: MailTemplate): OutboundMail | undefined {
    const email = to.trim().toLowerCase();
    for (let i = this.outbox.length - 1; i >= 0; i--) {
      const m = this.outbox[i]!;
      if (m.to.trim().toLowerCase() !== email) continue;
      if (template && m.template !== template) continue;
      return m;
    }
    return undefined;
  }

  lastTokenFor(to: string, template: MailTemplate): string | undefined {
    return this.lastFor(to, template)?.token;
  }
}

export function createEmailProvider(config: AppConfig): EmailProvider {
  switch (config.EMAIL_PROVIDER) {
    case "resend":
      if (!config.EMAIL_API_KEY) {
        throw new Error("EMAIL_API_KEY is required when EMAIL_PROVIDER=resend");
      }
      return new ResendEmailProvider(config.EMAIL_API_KEY);
    case "memory":
      return new MemoryEmailProvider();
    default: {
      const _exhaustive: never = config.EMAIL_PROVIDER;
      throw new Error(`Unsupported EMAIL_PROVIDER: ${_exhaustive}`);
    }
  }
}

export function createMailer(config: AppConfig): Mailer {
  // Tests always inject MemoryMailer; runtime uses the configured provider.
  if (config.isTest || config.EMAIL_PROVIDER === "memory") {
    return new MemoryMailer();
  }
  return new TemplateMailer(createEmailProvider(config), {
    appUrl: config.APP_URL,
    from: config.EMAIL_FROM,
  });
}
