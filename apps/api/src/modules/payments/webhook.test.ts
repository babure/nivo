import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { SERVICE_FEE_CENTS } from "@nivo/shared";
import { WEBHOOK_SECRET, createTestApp, signUpAndLogin } from "../../test/app-harness.js";

const stripe = new Stripe("sk_test_unused");

function signed(payload: object, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify(payload);
  const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  return { body, headers: { "content-type": "application/json", "stripe-signature": signature } };
}

function paidEvent(id: string, userId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_${id}`,
        object: "checkout.session",
        client_reference_id: userId,
        metadata: { userId },
        amount_total: SERVICE_FEE_CENTS,
        currency: "eur",
        payment_status: "paid",
        ...overrides,
      },
    },
  };
}

async function setup() {
  const ctx = await createTestApp();
  await signUpAndLogin(ctx.app, ctx.mailer);
  const user = (await ctx.repos.users.findByEmail("ada@example.com"))!;
  return { ...ctx, userId: user.id };
}

describe("POST /v1/webhooks/stripe", () => {
  it("rejects missing or invalid signatures and does not mark paid", async () => {
    const { app, repos, userId } = await setup();
    const { body } = signed(paidEvent("evt_a", userId));

    const missing = await app.inject({
      method: "POST",
      url: "/v1/webhooks/stripe",
      headers: { "content-type": "application/json" },
      payload: body,
    });
    expect(missing.statusCode).toBe(400);

    const forged = signed(paidEvent("evt_a", userId), "whsec_attacker");
    const bad = await app.inject({
      method: "POST",
      url: "/v1/webhooks/stripe",
      headers: forged.headers,
      payload: forged.body,
    });
    expect(bad.statusCode).toBe(400);
    expect((await repos.profiles.get(userId))?.paymentStatus).toBe("unpaid");
  });

  it("marks paid for EUR 149.00 and is idempotent by event id", async () => {
    const { app, repos, userId } = await setup();
    const evt = signed(paidEvent("evt_ok", userId));

    const send = () =>
      app.inject({ method: "POST", url: "/v1/webhooks/stripe", headers: evt.headers, payload: evt.body });

    const first = await send();
    expect(first.statusCode).toBe(200);
    expect(first.json().outcome).toBe("processed");
    const profile = await repos.profiles.get(userId);
    expect(profile?.paymentStatus).toBe("paid");
    expect(profile?.paidAt).toBeInstanceOf(Date);

    const second = await send();
    expect(second.statusCode).toBe(200);
    expect(second.json().outcome).toBe("duplicate");
    expect(await repos.payments.listForUser(userId)).toHaveLength(1);
    expect(await repos.payments.listInvoicesForUser(userId)).toHaveLength(1);
  });

  it("handles concurrent redeliveries of the same event exactly once", async () => {
    const { app, repos, userId } = await setup();
    const evt = signed(paidEvent("evt_race", userId));
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        app.inject({ method: "POST", url: "/v1/webhooks/stripe", headers: evt.headers, payload: evt.body }),
      ),
    );
    const outcomes = results.map((r) => r.json().outcome as string).sort();
    expect(outcomes.filter((o) => o === "processed")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "duplicate")).toHaveLength(5);
    expect(await repos.payments.listForUser(userId)).toHaveLength(1);
  });

  it("rejects wrong amount or currency without marking paid (still 200 so Stripe stops retrying)", async () => {
    const { app, repos, userId } = await setup();

    const cheap = signed(paidEvent("evt_cheap", userId, { amount_total: 100 }));
    const r1 = await app.inject({ method: "POST", url: "/v1/webhooks/stripe", headers: cheap.headers, payload: cheap.body });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().outcome).toBe("rejected");

    const usd = signed(paidEvent("evt_usd", userId, { currency: "usd" }));
    const r2 = await app.inject({ method: "POST", url: "/v1/webhooks/stripe", headers: usd.headers, payload: usd.body });
    expect(r2.json().outcome).toBe("rejected");

    const unpaid = signed(paidEvent("evt_unpaid", userId, { payment_status: "unpaid" }));
    const r3 = await app.inject({ method: "POST", url: "/v1/webhooks/stripe", headers: unpaid.headers, payload: unpaid.body });
    expect(r3.json().outcome).toBe("rejected");

    expect((await repos.profiles.get(userId))?.paymentStatus).toBe("unpaid");
  });

  it("a second paid event with a different id does not double-invoice", async () => {
    const { app, repos, userId } = await setup();
    for (const id of ["evt_1", "evt_2"]) {
      const e = signed(paidEvent(id, userId));
      await app.inject({ method: "POST", url: "/v1/webhooks/stripe", headers: e.headers, payload: e.body });
    }
    expect(await repos.payments.listInvoicesForUser(userId)).toHaveLength(1);
  });

  it("ignores events for unknown users and unrelated event types", async () => {
    const { app } = await setup();
    const ghost = signed(paidEvent("evt_ghost", "00000000-0000-4000-8000-000000000000"));
    const r1 = await app.inject({ method: "POST", url: "/v1/webhooks/stripe", headers: ghost.headers, payload: ghost.body });
    expect(r1.json().outcome).toBe("ignored");

    const other = signed({ id: "evt_other", object: "event", type: "customer.created", data: { object: {} } });
    const r2 = await app.inject({ method: "POST", url: "/v1/webhooks/stripe", headers: other.headers, payload: other.body });
    expect(r2.json().outcome).toBe("ignored");
  });

  it("payment unlocks cards for the student", async () => {
    const { app, mailer, userId } = await setup();
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "ada@example.com", password: "GoodPassword1" },
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    void mailer;

    const before = await app.inject({ method: "GET", url: "/v1/cards", headers: { cookie } });
    expect(before.json().cards.find((c: { key: string }) => c.key === "accommodation").status).toBe("locked");

    const e = signed(paidEvent("evt_unlock", userId));
    await app.inject({ method: "POST", url: "/v1/webhooks/stripe", headers: e.headers, payload: e.body });

    const after = await app.inject({ method: "GET", url: "/v1/cards", headers: { cookie } });
    const cards = after.json().cards as { key: string; status: string }[];
    expect(cards.find((c) => c.key === "accommodation")?.status).toBe("available");
    expect(cards.find((c) => c.key === "sim")?.status).toBe("locked");
    expect(cards.find((c) => c.key === "jobs")?.status).toBe("coming_soon");
  });
});
