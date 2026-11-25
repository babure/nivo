import { describe, expect, it } from "vitest";
import {
  isValidReferralCode,
  pickUniqueReferralCode,
  referralCodeBaseFromName,
  referralCodeCandidate,
} from "./referral-code.js";

describe("referralCodeBaseFromName", () => {
  it("slugifies a multi-word organisation name", () => {
    expect(referralCodeBaseFromName("Delhi Advisors")).toBe("DELHIADVISORS");
  });

  it("strips punctuation and diacritics", () => {
    expect(referralCodeBaseFromName("München Edu-Hub!")).toBe("MUNCHENEDUHUB");
  });

  it("pads short names to meet the 4-character minimum", () => {
    expect(referralCodeBaseFromName("AB").length).toBeGreaterThanOrEqual(4);
    expect(isValidReferralCode(referralCodeBaseFromName("AB"))).toBe(true);
  });
});

describe("referralCodeCandidate", () => {
  it("variant 0 is the plain base", () => {
    expect(referralCodeCandidate("Berlin Path", 0)).toBe("BERLINPATH");
  });

  it("higher variants stay within schema", () => {
    for (let i = 1; i < 8; i++) {
      expect(isValidReferralCode(referralCodeCandidate("Berlin Path", i))).toBe(true);
    }
  });
});

describe("pickUniqueReferralCode", () => {
  it("returns the base when free", async () => {
    const code = await pickUniqueReferralCode({
      name: "Sample Org",
      isTaken: () => false,
    });
    expect(code).toBe("SAMPLEORG");
  });

  it("skips taken and avoided codes", async () => {
    const taken = new Set(["SAMPLEORG", "SAMPLEORGAA"]);
    const code = await pickUniqueReferralCode({
      name: "Sample Org",
      avoid: ["SAMPLEORG"],
      isTaken: (c) => taken.has(c),
      maxAttempts: 60,
    });
    expect(code).not.toBe("SAMPLEORG");
    expect(isValidReferralCode(code)).toBe(true);
    expect(code.startsWith("SAMPLEORG")).toBe(true);
  });
});
