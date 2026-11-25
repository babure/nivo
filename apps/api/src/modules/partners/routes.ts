import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, parseStrict } from "../../lib/errors.js";
import { hashIp } from "../../lib/tokens.js";
import { requireAuthContext } from "../../plugins/auth.js";

export const PARTNER_LINKS_SETTING = "partner_links";

const PLACEHOLDERS = ["{{referral_code}}", "{{student_id}}", "{{user_id}}"] as const;

/** key -> https URL template (optional placeholders). */
export const partnerLinksSchema = z.record(
  z.string().regex(/^[a-z0-9_]{1,64}$/),
  z
    .string()
    .max(500)
    .refine((u) => {
      const stripped = PLACEHOLDERS.reduce((acc, p) => acc.split(p).join("x"), u);
      try {
        const parsed = new URL(stripped);
        return parsed.protocol === "https:";
      } catch {
        return false;
      }
    }, "Only https link templates are allowed"),
);

const keyParams = z.object({ key: z.string().regex(/^[a-z0-9_]{1,64}$/) });

function expandTemplate(
  template: string,
  ctx: { userId: string | null; referralCode: string | null },
): string {
  return template
    .split("{{student_id}}")
    .join(encodeURIComponent(ctx.userId ?? ""))
    .split("{{user_id}}")
    .join(encodeURIComponent(ctx.userId ?? ""))
    .split("{{referral_code}}")
    .join(encodeURIComponent(ctx.referralCode ?? ""));
}

export async function partnersRoutes(app: FastifyInstance): Promise<void> {
  const { repos } = app.services;

  async function links(): Promise<Record<string, string>> {
    const stored = await repos.settings.get<unknown>(PARTNER_LINKS_SETTING);
    const parsed = partnerLinksSchema.safeParse(stored ?? {});
    return parsed.success ? parsed.data : {};
  }

  app.get("/v1/partners", async () => ({ partners: Object.keys(await links()) }));

  /** Click-tracking redirect with templated HTTPS URLs (REQ-PART-01/03/04). */
  app.get("/v1/partners/:key/go", async (req, reply) => {
    const { key } = parseStrict(keyParams, req.params);
    const urlTemplate = (await links())[key];
    if (!urlTemplate) throw new AppError("NOT_FOUND", "Unknown partner link.");

    const userId = req.auth?.user.id ?? null;
    let referralCode: string | null = null;
    if (userId) {
      const profile = await repos.profiles.get(userId);
      referralCode = profile?.referralCode ?? null;
    }

    const url = expandTemplate(urlTemplate, { userId, referralCode });
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new AppError("INTERNAL", "Partner link is misconfigured.");
    }
    if (parsed.protocol !== "https:") {
      throw new AppError("FORBIDDEN", "Partner redirects must use https.");
    }

    await repos.clicks.record({
      linkKey: key,
      userId,
      ipHash: hashIp(req.ip),
      at: new Date(),
    });
    return reply.redirect(url, 302);
  });

  /** Authenticated preview of expanded URL (no click log). */
  app.get("/v1/partners/:key/url", { preHandler: app.requireAuth }, async (req) => {
    const { key } = parseStrict(keyParams, req.params);
    const urlTemplate = (await links())[key];
    if (!urlTemplate) throw new AppError("NOT_FOUND", "Unknown partner link.");
    const ctx = requireAuthContext(req);
    const profile = await repos.profiles.get(ctx.user.id);
    return {
      key,
      url: expandTemplate(urlTemplate, {
        userId: ctx.user.id,
        referralCode: profile?.referralCode ?? null,
      }),
    };
  });
}
