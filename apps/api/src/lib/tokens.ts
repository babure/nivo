import { createHash, randomBytes } from "node:crypto";

/** 256-bit URL-safe random token. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only the hash of a session / email / reset token is ever stored. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Privacy-preserving IP fingerprint for consent and click records. */
export function hashIp(ip: string | undefined, salt = "nivo"): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`${salt}:${ip}`, "utf8").digest("hex").slice(0, 32);
}
