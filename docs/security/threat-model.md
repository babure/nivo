# Threat model (STRIDE summary)

Full per-module risks: `docs/design/00-fmea.md`. Controls: `docs/design/00-security-controls.md`.

## Top threats

1. Account takeover (credential stuffing) → Argon2id, rate limits, lockout, optional 2FA
2. Payment unlock bypass → webhook-only unlock, signature verify, amount check
3. Identity data leak → field/file encryption, masked UI, audited reveal, no logs
4. Consultancy cross-tenant access → RLS + API + matrix tests
5. Admin privilege abuse → permissions, maker-checker, step-up, audit hash chain
6. Malicious upload → magic bytes, AV, size limits, private bucket
7. CSRF / session fixation → CSRF token, rotate on login
