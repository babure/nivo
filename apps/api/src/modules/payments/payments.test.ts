import { beforeEach, describe, expect, it } from "vitest";
import { SERVICE_FEE_CENTS } from "@nivo/shared";
import { createTestServices, registerInput } from "../../test/harness.js";
import type { Services } from "../../services.js";
import type { MemoryMailer } from "../../lib/mailer.js";

describe("PaymentsService", () => {
  let svc: Services & { mailer: MemoryMailer };
  let userId: string;

  beforeEach(async () => {
    svc = createTestServices();
    await svc.auth.register(registerInput);
    const token = svc.mailer.lastTokenFor(registerInput.email, "verify_email")!;
    await svc.auth.verifyEmail(token);
    const user = await svc.repos.users.findByEmail(registerInput.email);
    userId = user!.id;
  });

  it("T-PAY-010: webhook unlocks only with correct amount and is idempotent", async () => {
    const event = {
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          metadata: { userId },
          amount_total: SERVICE_FEE_CENTS,
          currency: "eur",
          payment_status: "paid",
        },
      },
    };
    const first = await svc.payments.handleEvent(event);
    expect(first.status).toBe("processed");
    const profile = await svc.repos.profiles.get(userId);
    expect(profile?.paymentStatus).toBe("paid");

    const second = await svc.payments.handleEvent(event);
    expect(second.status).toBe("duplicate");
  });

  it("T-PAY-010b: rejects wrong amount", async () => {
    const outcome = await svc.payments.handleEvent({
      id: "evt_bad",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_bad",
          metadata: { userId },
          amount_total: 100,
          currency: "eur",
          payment_status: "paid",
        },
      },
    });
    expect(outcome.status).toBe("rejected");
    const profile = await svc.repos.profiles.get(userId);
    expect(profile?.paymentStatus).toBe("unpaid");
  });
});
