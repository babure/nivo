import { describe, expect, it } from "vitest";
import {
  AUDIT_GENESIS,
  auditHash,
  decryptField,
  deriveKeyFromSecret,
  encryptField,
} from "./crypto.js";

describe("field encryption", () => {
  it("T-ID-001: round-trips passport number", () => {
    const key = deriveKeyFromSecret("test-master-key-not-for-prod");
    const blob = encryptField("A1234567", key, "k1");
    expect(blob.ciphertext).not.toContain("A1234567");
    expect(decryptField(blob, key)).toBe("A1234567");
  });

  it("tamper detection on ciphertext", () => {
    const key = deriveKeyFromSecret("test-master-key-not-for-prod");
    const blob = encryptField("secret", key, "k1");
    blob.ciphertext = Buffer.from("tampered").toString("base64");
    expect(() => decryptField(blob, key)).toThrow();
  });
});

describe("audit hash chain", () => {
  it("T-ADM-030: chain breaks if middle entry altered", () => {
    const h1 = auditHash(AUDIT_GENESIS, "entry1");
    const h2 = auditHash(h1, "entry2");
    const h2tampered = auditHash(h1, "ENTRY2-ALTERED");
    expect(h2).not.toBe(h2tampered);
    const h3 = auditHash(h2, "entry3");
    const h3fromTamper = auditHash(h2tampered, "entry3");
    expect(h3).not.toBe(h3fromTamper);
  });
});
