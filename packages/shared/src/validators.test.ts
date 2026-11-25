import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  accommodationLeadSchema,
  createAdminSchema,
  createConsultancySchema,
  emailSchema,
  formatValidationIssues,
  maskSecret,
  passportNumberSchema,
  passwordSchema,
  personNameSchema,
  phoneSchema,
  registerSchema,
} from "./validators.js";

describe("validators", () => {
  it("accepts passport-style names", () => {
    expect(personNameSchema.parse("Anoop Sai Tummula")).toBe(
      "Anoop Sai Tummula",
    );
    expect(personNameSchema.parse("O'Connor")).toBe("O'Connor");
  });

  it("rejects empty or digit names", () => {
    expect(() => personNameSchema.parse("A")).toThrow();
    expect(() => personNameSchema.parse("John3")).toThrow();
  });

  it("normalises email", () => {
    expect(emailSchema.parse("  Student@Example.COM ")).toBe(
      "student@example.com",
    );
  });

  it("phone must be E.164-like", () => {
    expect(phoneSchema.parse("+4915123456789")).toBe("+4915123456789");
    expect(() => phoneSchema.parse("015123")).toThrow();
  });

  it("passport number 6-9 alnum", () => {
    expect(passportNumberSchema.parse("a1234567")).toBe("A1234567");
    expect(() => passportNumberSchema.parse("ABC")).toThrow();
  });

  it("password strength", () => {
    expect(() => passwordSchema.parse("short")).toThrow();
    expect(() => passwordSchema.parse("alllowercase1")).toThrow();
    expect(() => passwordSchema.parse("ALLUPPERCASE1")).toThrow();
    expect(() => passwordSchema.parse("NoNumbersHere")).toThrow();
    expect(passwordSchema.parse("GoodPassword1")).toBe("GoodPassword1");
  });

  it("register requires unticked-style literals for age", () => {
    expect(() =>
      registerSchema.parse({
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        phone: "+4915123456789",
        country: "India",
        intake: "Summer 2027",
        password: "GoodPassword1",
        ageConfirmed: false,
        acceptedTermsVersion: "1.0",
        acceptedPrivacyVersion: "1.0",
      }),
    ).toThrow();
  });

  it("maskSecret hides all but last 3", () => {
    expect(maskSecret("A1234567")).toBe("*****567");
  });

  it("createAdmin requires strong password", () => {
    expect(() =>
      createAdminSchema.parse({
        email: "admin@nivo.test",
        fullName: "Ada Admin",
        password: "tooshort1A",
      }),
    ).toThrow();
    expect(
      createAdminSchema.parse({
        email: "admin@nivo.test",
        fullName: "Ada Admin",
        password: "GoodPassword1",
      }).email,
    ).toBe("admin@nivo.test");
  });

  it("createConsultancy accepts optional manager email invite without password", () => {
    expect(
      createConsultancySchema.parse({
        name: "Partner Org",
        code: "PARTNER1",
        managerEmail: "mgr@partner.test",
      }).managerEmail,
    ).toBe("mgr@partner.test");
    expect(
      createConsultancySchema.parse({
        name: "Partner Org",
        code: "PARTNER1",
      }).name,
    ).toBe("Partner Org");
  });

  it("accommodation lead phone must be E.164", () => {
    expect(() =>
      accommodationLeadSchema.parse({
        city: "Berlin",
        budget: "600",
        roomType: "shared",
        phone: "01701234567",
      }),
    ).toThrow();
    expect(
      accommodationLeadSchema.parse({
        city: "Berlin",
        budget: "600",
        roomType: "shared",
        phone: "+491701234567",
      }).city,
    ).toBe("Berlin");
  });

  it("formatValidationIssues is actionable", () => {
    expect(formatValidationIssues([{ path: ["password"], message: "Use at least 12 characters" }])).toBe(
      "password: Use at least 12 characters",
    );
    expect(
      formatValidationIssues([
        { path: ["email"], message: "Enter a valid email address" },
        { path: ["password"], message: "Add at least one number" },
      ]),
    ).toMatch(/^Fix 2 fields:/);
  });

  it("property: passport schema accepts only 6-9 A-Z0-9", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Z0-9]{6,9}$/), (s) => {
        expect(passportNumberSchema.parse(s)).toBe(s);
      }),
    );
  });
});
