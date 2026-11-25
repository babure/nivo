import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROLES,
  PERMISSIONS,
  assertPermission,
  hasPermission,
} from "./permissions.js";

describe("permissions registry", () => {
  it("T-ADM-001: super_admin has every permission", () => {
    for (const p of PERMISSIONS) {
      expect(hasPermission(DEFAULT_ROLES.super_admin, p)).toBe(true);
    }
  });

  it("consultancy has no admin permissions", () => {
    expect(DEFAULT_ROLES.consultancy).toEqual([]);
    expect(hasPermission(DEFAULT_ROLES.consultancy, "students:read")).toBe(false);
  });

  it("only product roles are registered", () => {
    expect(Object.keys(DEFAULT_ROLES).sort()).toEqual(["consultancy", "super_admin"]);
  });

  it("assertPermission throws FORBIDDEN", () => {
    expect(() => assertPermission(DEFAULT_ROLES.consultancy, "payments:refund")).toThrow(
      /FORBIDDEN:payments:refund/,
    );
  });
});
