import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  emailSchema,
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

  it("property: passport schema accepts only 6-9 A-Z0-9", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Z0-9]{6,9}$/), (s) => {
        expect(passportNumberSchema.parse(s)).toBe(s);
      }),
    );
  });
});
