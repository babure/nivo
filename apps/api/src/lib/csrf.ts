import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const csrfBySession = new Map<string, string>();

export function csrfCookieName(isProd: boolean): string {
  return isProd ? "__Host-nivo_csrf" : "nivo_csrf";
}

export function issueCsrfToken(sessionId: string): string {
  const token = randomBytes(32).toString("base64url");
  csrfBySession.set(sessionId, token);
  return token;
}

export function peekCsrfToken(sessionId: string): string | undefined {
  return csrfBySession.get(sessionId);
}

export function clearCsrfToken(sessionId: string): void {
  csrfBySession.delete(sessionId);
}

export function verifyCsrfToken(sessionId: string, presented: string | undefined): boolean {
  const expected = csrfBySession.get(sessionId);
  if (!expected || !presented) return false;
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(presented).digest();
  return timingSafeEqual(a, b);
}

/** Test helper */
export function clearAllCsrfTokens(): void {
  csrfBySession.clear();
}
