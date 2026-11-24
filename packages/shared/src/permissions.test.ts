import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROLES,
  PERMISSIONS,
  assertPermission,
  canApproveRequest,
  hasPermission,
} from "./permissions.js";

describe("permissions registry", () => {
  it("T-ADM-001: super_admin has every permission", () => {
    for (const p of PERMISSIONS) {
      expect(hasPermission(DEFAULT_ROLES.super_admin, p)).toBe(true);
    }
  });

  it("T-ACC-010: accommodation_agent cannot refund or reveal identity", () => {
    const role = DEFAULT_ROLES.accommodation_agent;
    expect(hasPermission(role, "leads:read")).toBe(true);
    expect(hasPermission(role, "payments:refund")).toBe(false);
    expect(hasPermission(role, "identity:reveal")).toBe(false);
  });

  it("T-ADM-010: requester cannot approve own request", () => {
    expect(
      canApproveRequest("u1", "u1", DEFAULT_ROLES.operations_approver),
    ).toBe(false);
    expect(
      canApproveRequest("u1", "u2", DEFAULT_ROLES.operations_approver),
    ).toBe(true);
  });

  it("assertPermission throws FORBIDDEN", () => {
    expect(() =>
      assertPermission(DEFAULT_ROLES.support, "payments:refund"),
    ).toThrow(/FORBIDDEN:payments:refund/);
  });
});
