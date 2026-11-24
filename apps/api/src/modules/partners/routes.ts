import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, parseStrict } from "../../lib/errors.js";
import { hashIp } from "../../lib/tokens.js";

export const PARTNER_LINKS_SETTING = "partner_links";

/** key -> https URL. Only https targets are ever redirected to (no open redirect to arbitrary schemes). */
export const partnerLinksSchema = z.record(
  z.string().regex(/^[a-z0-9_]{1,64}$/),
  z
    .string()
    .url()
    .max(500)
    .refine((u) => u.startsWith("https://"), "Only https links are allowed"),
);

const keyParams = z.object({ key: z.string().regex(/^[a-z0-9_]{1,64}$/) });

export async function partnersRoutes(app: FastifyInstance): Promise<void> {
  const { repos } = app.services;

  async function links(): Promise<Record<string, string>> {
    const stored = await repos.settings.get<unknown>(PARTNER_LINKS_SETTING);
    const parsed = partnerLinksSchema.safeParse(stored ?? {});
    return parsed.success ? parsed.data : {};
  }

  app.get("/v1/partners", async () => ({ partners: Object.keys(await links()) }));

  /** Click-tracking redirect. Optional auth: the click is attributed when a session exists. */
  app.get("/v1/partners/:key/go", async (req, reply) => {
    const { key } = parseStrict(keyParams, req.params);
    const url = (await links())[key];
    if (!url) throw new AppError("NOT_FOUND", "Unknown partner link.");
    await repos.clicks.record({
      linkKey: key,
      userId: req.auth?.user.id ?? null,
      ipHash: hashIp(req.ip),
      at: new Date(),
    });
    return reply.redirect(url, 302);
  });
}
