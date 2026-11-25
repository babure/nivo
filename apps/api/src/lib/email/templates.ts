import type { MailTemplate } from "../mailer.js";

export type MailTemplateVars = {
  fullName?: string;
  invoiceNumber?: string;
  amountLabel?: string;
  cardTitle?: string;
  city?: string;
  leadId?: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

export function renderMailTemplate(
  template: MailTemplate,
  opts: { appUrl: string; token?: string; vars?: MailTemplateVars },
): RenderedEmail {
  const base = opts.appUrl.replace(/\/$/, "");
  const vars = opts.vars ?? {};
  switch (template) {
    case "verify_email": {
      const link = `${base}/verify-email?token=${encodeURIComponent(opts.token ?? "")}`;
      return {
        subject: "Verify your NIVO email",
        text: `Welcome to NIVO.\n\nConfirm your email by opening this link:\n${link}\n\nThis link expires in 24 hours. If you did not create an account, you can ignore this email.`,
        html: `<p>Welcome to NIVO.</p><p><a href="${link}">Confirm your email</a></p><p>This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>`,
      };
    }
    case "reset_password": {
      const link = `${base}/reset-password?token=${encodeURIComponent(opts.token ?? "")}`;
      return {
        subject: "Reset your NIVO password",
        text: `We received a request to reset your NIVO password.\n\nOpen this link to choose a new password:\n${link}\n\nIf you did not ask for a reset, you can ignore this email.`,
        html: `<p>We received a request to reset your NIVO password.</p><p><a href="${link}">Choose a new password</a></p><p>If you did not ask for a reset, you can ignore this email.</p>`,
      };
    }
    case "already_registered":
      return {
        subject: "Your NIVO account",
        text: `Someone tried to register with this email on NIVO.\n\nIf that was you, sign in at ${base}/login or reset your password at ${base}/forgot-password.\n\nIf it was not you, you can ignore this email.`,
        html: `<p>Someone tried to register with this email on NIVO.</p><p><a href="${base}/login">Sign in</a> or <a href="${base}/forgot-password">reset your password</a>.</p><p>If it was not you, you can ignore this email.</p>`,
      };
    case "welcome": {
      const name = vars.fullName ?? "there";
      return {
        subject: "Welcome to NIVO — a place for new beginnings",
        text: `Hi ${name},\n\nYour email is verified. Next, activate your NIVO account with the one-time service fee (€149), then complete identity onboarding to unlock blocked account, SIM and housing guidance.\n\nOpen your dashboard: ${base}/dashboard\n\nPartner products (Sperrkonto, SIM, rent) are charged by partners separately.`,
        html: `<p>Hi ${name},</p><p>Your email is verified. Next, activate your NIVO account with the one-time service fee (€149), then complete identity onboarding to unlock blocked account, SIM and housing guidance.</p><p><a href="${base}/dashboard">Open your dashboard</a></p><p>Partner products (Sperrkonto, SIM, rent) are charged by partners separately.</p>`,
      };
    }
    case "pay_receipt": {
      const name = vars.fullName ?? "there";
      const inv = vars.invoiceNumber ?? "";
      const amount = vars.amountLabel ?? "€149";
      return {
        subject: `NIVO payment receipt${inv ? ` — ${inv}` : ""}`,
        text: `Hi ${name},\n\nWe received your NIVO service fee (${amount}).${inv ? `\nInvoice: ${inv}` : ""}\n\nDownload invoices anytime from Document store: ${base}/documents\n\nThank you for starting your journey with NIVO.`,
        html: `<p>Hi ${name},</p><p>We received your NIVO service fee (${amount}).${inv ? ` Invoice <strong>${inv}</strong>.` : ""}</p><p><a href="${base}/documents">Open Document store</a></p><p>Thank you for starting your journey with NIVO.</p>`,
      };
    }
    case "sim_unlocked": {
      const name = vars.fullName ?? "there";
      return {
        subject: "Your NIVO SIM card is unlocked",
        text: `Hi ${name},\n\nYour SIM checklist item is now unlocked. Open your dashboard to continue:\n${base}/dashboard\n`,
        html: `<p>Hi ${name},</p><p>Your SIM checklist item is now unlocked.</p><p><a href="${base}/dashboard">Open dashboard</a></p>`,
      };
    }
    case "accommodation_lead": {
      const city = vars.city ?? "Germany";
      const leadId = vars.leadId ?? "";
      return {
        subject: `New NIVO accommodation enquiry${city ? ` — ${city}` : ""}`,
        text: `A student submitted an accommodation enquiry${city ? ` for ${city}` : ""}.${leadId ? `\nLead ID: ${leadId}` : ""}\n\nReview leads in the admin panel.`,
        html: `<p>A student submitted an accommodation enquiry${city ? ` for <strong>${city}</strong>` : ""}.</p>${leadId ? `<p>Lead ID: ${leadId}</p>` : ""}<p>Review leads in the admin panel.</p>`,
      };
    }
    case "accommodation_enquiry_received": {
      const name = vars.fullName ?? "there";
      return {
        subject: "We received your housing enquiry",
        text: `Hi ${name},\n\nYour accommodation enquiry was received. Our partner will follow up soon.\n\nTrack status: ${base}/accommodation\n`,
        html: `<p>Hi ${name},</p><p>Your accommodation enquiry was received. Our partner will follow up soon.</p><p><a href="${base}/accommodation">View status</a></p>`,
      };
    }
    case "coming_soon_notify": {
      const title = vars.cardTitle ?? "feature";
      return {
        subject: `${title} is now available on NIVO`,
        text: `The ${title} card is live on your NIVO dashboard.\n\nOpen: ${base}/dashboard\n\nYou received this because you asked to be notified.`,
        html: `<p>The <strong>${title}</strong> card is live on your NIVO dashboard.</p><p><a href="${base}/dashboard">Open dashboard</a></p>`,
      };
    }
    case "withdrawal_ack": {
      const name = vars.fullName ?? "there";
      return {
        subject: "NIVO — early performance acknowledgement",
        text: `Hi ${name},\n\nYou asked NIVO to start the service immediately when paying. This may affect your right of withdrawal. Details: ${base}/legal/withdrawal\n`,
        html: `<p>Hi ${name},</p><p>You asked NIVO to start the service immediately when paying. This may affect your right of withdrawal.</p><p><a href="${base}/legal/withdrawal">Withdrawal information</a></p>`,
      };
    }
    default: {
      const _exhaustive: never = template;
      throw new Error(`Unknown mail template: ${_exhaustive}`);
    }
  }
}
