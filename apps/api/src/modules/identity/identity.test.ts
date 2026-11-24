import { beforeEach, describe, expect, it } from "vitest";
import { SERVICE_FEE_CENTS } from "@nivo/shared";
import { createTestServices, registerInput } from "../../test/harness.js";
import type { Services } from "../../services.js";
import type { MemoryMailer } from "../../lib/mailer.js";

const identityBody = {
  fullName: "Ada Lovelace",
  fatherName: "Lord Byron",
  motherName: "Anne Byron",
  phone: "+4915123456789",
  email: "ada@example.com",
  currentAddress: {
    street: "Main",
    houseNumber: "1",
    city: "Berlin",
    postalCode: "10115",
    country: "Germany",
  },
  permanentAddress: {
    street: "Main",
    houseNumber: "1",
    city: "Berlin",
    postalCode: "10115",
    country: "Germany",
  },
  permanentSameAsCurrent: true,
  passportNumber: "A1234567",
  identityConsent: true as const,
};

describe("IdentityService", () => {
  let svc: Services & { mailer: MemoryMailer };
  let userId: string;

  beforeEach(async () => {
    svc = createTestServices();
    await svc.auth.register(registerInput);
    await svc.auth.verifyEmail(svc.mailer.lastTokenFor(registerInput.email, "verify_email")!);
    userId = (await svc.repos.users.findByEmail(registerInput.email))!.id;
    await svc.payments.handleEvent({
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
    });
  });

  it("T-ID-001: stores masked passport fields", async () => {
    await svc.identity.save(userId, identityBody);
    const masked = await svc.identity.getMasked(userId);
    expect(masked.complete).toBe(true);
    expect(masked.passportNumber).toMatch(/567$/);
    const row = await svc.repos.identity.get(userId);
    expect(JSON.stringify(row?.payload)).not.toContain("A1234567");
  });

  it("sniffs upload mime types", async () => {
    const { sniffMime } = await import("./service.js");
    expect(sniffMime(Buffer.from("%PDF-1.4"))).toBe("application/pdf");
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(Buffer.from("not-a-file"))).toBeNull();
  });
});
