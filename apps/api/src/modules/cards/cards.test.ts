import { beforeEach, describe, expect, it } from "vitest";
import { SERVICE_FEE_CENTS } from "@nivo/shared";
import { createTestServices, registerInput } from "../../test/harness.js";
import type { Services } from "../../services.js";
import type { MemoryMailer } from "../../lib/mailer.js";
import { DEFAULT_SIM_REQUIRED, SIM_RULES_SETTING } from "./service.js";

async function pay(svc: Services & { mailer: MemoryMailer }, userId: string) {
  await svc.payments.handleEvent({
    id: `evt_${userId}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_${userId}`,
        metadata: { userId },
        amount_total: SERVICE_FEE_CENTS,
        currency: "eur",
        payment_status: "paid",
      },
    },
  });
}

describe("CardsService", () => {
  let svc: Services & { mailer: MemoryMailer };
  let userId: string;

  beforeEach(async () => {
    svc = createTestServices();
    await svc.auth.register(registerInput);
    await svc.auth.verifyEmail(svc.mailer.lastTokenFor(registerInput.email, "verify_email")!);
    userId = (await svc.repos.users.findByEmail(registerInput.email))!.id;
    await pay(svc, userId);
    await svc.repos.profiles.upsert({
      ...(await svc.repos.profiles.get(userId))!,
      identityComplete: true,
    });
  });

  it("T-CARD-030: unpaid cannot open card transitions", async () => {
    const unpaid = createTestServices();
    await unpaid.auth.register({ ...registerInput, email: "bob@example.com" });
    await unpaid.auth.verifyEmail(
      unpaid.mailer.lastTokenFor("bob@example.com", "verify_email")!,
    );
    const bob = (await unpaid.repos.users.findByEmail("bob@example.com"))!;
    await expect(
      unpaid.cards.setStatus(bob.id, "blocked_account", "in_progress"),
    ).rejects.toMatchObject({ code: "CARD_LOCKED" });
  });

  it("admin bypass can force status on a locked card", async () => {
    const unpaid = createTestServices();
    await unpaid.auth.register({ ...registerInput, email: "locked@example.com" });
    await unpaid.auth.verifyEmail(
      unpaid.mailer.lastTokenFor("locked@example.com", "verify_email")!,
    );
    const student = (await unpaid.repos.users.findByEmail("locked@example.com"))!;
    await expect(
      unpaid.cards.setStatus(student.id, "blocked_account", "in_progress"),
    ).rejects.toMatchObject({ code: "CARD_LOCKED" });

    const view = await unpaid.cards.setStatus(student.id, "blocked_account", "in_progress", {
      actorId: "admin",
      bypassStudentLimits: true,
    });
    expect(view.status).toBe("in_progress");

    const completed = await unpaid.cards.setStatus(student.id, "blocked_account", "completed", {
      actorId: "admin",
      bypassStudentLimits: true,
    });
    expect(completed.status).toBe("completed");
  });

  it("T-CARD-010: completing Blocked Account unlocks SIM", async () => {
    expect(DEFAULT_SIM_REQUIRED).toEqual(["blocked_account"]);
    await svc.cards.setStatus(userId, "blocked_account", "in_progress");
    await svc.cards.setStatus(userId, "blocked_account", "completed");
    const cards = await svc.cards.list(userId);
    expect(cards.find((c) => c.key === "sim")?.status).toBe("available");
  });

  it("T-ADM-SIM: grandfathering when rules tighten", async () => {
    await svc.cards.setStatus(userId, "blocked_account", "in_progress");
    await svc.cards.setStatus(userId, "blocked_account", "completed");
    expect((await svc.cards.list(userId)).find((c) => c.key === "sim")?.status).toBe(
      "available",
    );
    await svc.repos.settings.set(
      SIM_RULES_SETTING,
      ["blocked_account", "insurance"],
      "admin",
    );
    expect((await svc.cards.list(userId)).find((c) => c.key === "sim")?.status).toBe(
      "available",
    );
  });
});
