import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const ALGO = "aes-256-gcm";

export type EncryptedBlob = {
  keyId: string;
  iv: string; // base64
  tag: string; // base64
  ciphertext: string; // base64
};

export function deriveKeyFromSecret(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptField(
  plaintext: string,
  key: Buffer,
  keyId: string,
): EncryptedBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    keyId,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: enc.toString("base64"),
  };
}

export function decryptField(blob: EncryptedBlob, key: Buffer): string {
  const decipher = createDecipheriv(
    ALGO,
    key,
    Buffer.from(blob.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

/** Hash chain link for tamper-evident audit log */
export function auditHash(
  prevHash: string,
  payload: string,
): string {
  return createHash("sha256")
    .update(prevHash + "\n" + payload, "utf8")
    .digest("hex");
}

export const AUDIT_GENESIS = "0".repeat(64);
