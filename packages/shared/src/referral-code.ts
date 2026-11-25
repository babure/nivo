import { referralCodeSchema } from "./validators.js";

/** Alphabet without ambiguous I/L/O/0/1 — readable for verbal sharing. */
const SUFFIX_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Turn an organisation name into a referral-code base:
 * uppercase A–Z / 0–9 only, length 4–20 (fits schema + room for a suffix).
 */
export function referralCodeBaseFromName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");

  let base = slug.slice(0, 20);
  if (base.length < 4) {
    base = `${base}NIVO`.slice(0, 8);
  }
  if (base.length < 4) {
    base = "PARTNER";
  }
  return base;
}

function randomSuffix(length: number): string {
  let out = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    out += SUFFIX_ALPHABET[bytes[i]! % SUFFIX_ALPHABET.length]!;
  }
  return out;
}

/**
 * Build one candidate. `variant === 0` is the plain meaningful base;
 * higher variants append a short unique suffix.
 */
export function referralCodeCandidate(name: string, variant: number): string {
  const base = referralCodeBaseFromName(name);
  if (variant <= 0) return base;
  const suffixLen = variant < 20 ? 2 : 3;
  const suffix = randomSuffix(suffixLen);
  return `${base.slice(0, 32 - suffix.length)}${suffix}`;
}

export function isValidReferralCode(code: string): boolean {
  return referralCodeSchema.safeParse(code).success;
}

/**
 * Pick a unique code for `name`. Pass codes already shown (or taken) in `avoid`
 * so Regenerate never returns the same suggestion.
 */
export async function pickUniqueReferralCode(opts: {
  name: string;
  isTaken: (code: string) => boolean | Promise<boolean>;
  avoid?: Iterable<string>;
  maxAttempts?: number;
}): Promise<string> {
  const avoid = new Set(
    [...(opts.avoid ?? [])].map((c) => c.trim().toUpperCase()).filter(Boolean),
  );
  const max = opts.maxAttempts ?? 48;

  for (let variant = 0; variant < max; variant++) {
    // After the first try (or whenever avoid is non-empty), skip bare base
    // so regenerate always yields a fresh variant.
    const start = avoid.size > 0 && variant === 0 ? 1 : variant;
    const code = referralCodeCandidate(opts.name, start).toUpperCase();
    if (!isValidReferralCode(code)) continue;
    if (avoid.has(code)) continue;
    if (await opts.isTaken(code)) {
      avoid.add(code);
      continue;
    }
    return code;
  }

  throw new Error("Could not generate a unique referral code. Try a different organisation name.");
}
