import { describe, expect, it } from "vitest";
import {
  homePathFor,
  isSafeReturnPath,
  logoutPathFor,
  resolvePostLoginPath,
} from "./navigation";

describe("navigation helpers", () => {
  it("sends each role to its home", () => {
    expect(homePathFor({ role: "admin", paymentStatus: "unpaid", identityComplete: false })).toBe(
      "/admin/dashboard",
    );
    expect(
      homePathFor({ role: "consultancy", paymentStatus: "unpaid", identityComplete: false }),
    ).toBe("/consultancy/dashboard");
    expect(homePathFor({ role: "student", paymentStatus: "unpaid", identityComplete: false })).toBe(
      "/pay",
    );
    expect(homePathFor({ role: "student", paymentStatus: "paid", identityComplete: false })).toBe(
      "/onboarding/identity",
    );
    expect(homePathFor({ role: "student", paymentStatus: "paid", identityComplete: true })).toBe(
      "/dashboard",
    );
    expect(
      homePathFor({
        role: "student",
        paymentStatus: "paid",
        identityComplete: true,
        termsReacceptRequired: true,
      }),
    ).toBe("/legal/reaccept");
  });

  it("ignores student from= for admin login", () => {
    const admin = { role: "admin" as const, paymentStatus: "unpaid", identityComplete: false };
    expect(isSafeReturnPath("/dashboard", "admin")).toBe(false);
    expect(isSafeReturnPath("/pay", "admin")).toBe(false);
    expect(isSafeReturnPath("/admin/leads", "admin")).toBe(true);
    expect(resolvePostLoginPath(admin, "/dashboard")).toBe("/admin/dashboard");
    expect(resolvePostLoginPath(admin, "/admin/proofs")).toBe("/admin/proofs");
  });

  it("logout destinations", () => {
    expect(logoutPathFor("admin")).toBe("/admin/login");
    expect(logoutPathFor("consultancy")).toBe("/login");
    expect(logoutPathFor("student")).toBe("/");
    expect(logoutPathFor(null)).toBe("/");
  });
});
