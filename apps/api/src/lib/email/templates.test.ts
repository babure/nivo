import { describe, expect, it } from "vitest";
import { renderMailTemplate } from "./templates.js";

describe("renderMailTemplate", () => {
  it("builds verify and reset links from APP_URL", () => {
    const verify = renderMailTemplate("verify_email", {
      appUrl: "http://localhost:5173/",
      token: "tok_verify_1234567890abcdef",
    });
    expect(verify.subject).toMatch(/verify/i);
    expect(verify.html).toContain(
      "http://localhost:5173/verify-email?token=tok_verify_1234567890abcdef",
    );

    const reset = renderMailTemplate("reset_password", {
      appUrl: "http://localhost:5173",
      token: "tok_reset_1234567890abcdef",
    });
    expect(reset.html).toContain(
      "http://localhost:5173/reset-password?token=tok_reset_1234567890abcdef",
    );
  });

  it("renders welcome and pay_receipt", () => {
    const welcome = renderMailTemplate("welcome", {
      appUrl: "http://localhost:5173",
      vars: { fullName: "Ada" },
    });
    expect(welcome.subject).toMatch(/welcome/i);
    expect(welcome.text).toContain("Ada");

    const receipt = renderMailTemplate("pay_receipt", {
      appUrl: "http://localhost:5173",
      vars: { fullName: "Ada", invoiceNumber: "NIVO-2026-000001", amountLabel: "€149" },
    });
    expect(receipt.subject).toContain("NIVO-2026-000001");
    expect(receipt.html).toContain("€149");
  });
});
