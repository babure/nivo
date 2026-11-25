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

  it("renders consultancy and student invite templates", () => {
    const mgr = renderMailTemplate("consultancy_invite", {
      appUrl: "http://localhost:5173",
      token: "tok_invite_1234567890abcdef",
      vars: { organisationName: "Delhi Advisors" },
    });
    expect(mgr.subject).toContain("Delhi Advisors");
    expect(mgr.html).toContain("invite=consultancy");
    expect(mgr.html).toContain("tok_invite_1234567890abcdef");

    const student = renderMailTemplate("student_referral_invite", {
      appUrl: "http://localhost:5173",
      vars: {
        organisationName: "Delhi Advisors",
        referralCode: "DELHI01",
        fullName: "Priya",
      },
    });
    expect(student.subject).toContain("Delhi Advisors");
    expect(student.html).toContain("/r/DELHI01");
    expect(student.text).toContain("Priya");
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
