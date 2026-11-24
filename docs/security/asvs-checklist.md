# OWASP ASVS 4.0.3 Level 2 — Verification Checklist

| Field | Value |
|-------|-------|
| Status | Review |
| Standard | OWASP Application Security Verification Standard 4.0.3, **Level 2** (target for launch; L3 items noted where cheap) |
| Scope | `apps/web` (student, admin and consultancy SPAs), `apps/api`, workers, edge (Caddy), PostgreSQL, object storage |
| Owner | NIVO Engineering (security champion) |
| Last updated | 2026-11-24 |
| Traceability | `docs/design/00-security-controls.md`, `docs/design/00-fmea.md`, `docs/security/pentest-scope.md` |

How to use this file

- One row per ASVS requirement **group** that applies to NIVO (not every one of the ~280 L2 items is listed; the full ASVS CSV is imported into the pen-test report). Each row names the NIVO control (`CTRL-*`), the module that owns it, and the automated test(s) that prove it.
- **Status** values: `Designed` (in the module LLD, test written first per TDD), `Built` (implemented, tests green), `Verified` (confirmed by the external pen test or an independent review), `N/A` (with reason), `Gap` (open — linked to a `GAP-*` ID).
- A requirement is **launch-blocking** if it is marked `Gap` and its ASVS level is L1, or if it protects identity data, payment or admin control.
- Before go-live the security champion walks every row, changes status to `Built` with a CI link, and the pen-test report moves rows to `Verified`.

## V1 Architecture, design and threat modelling

| ASVS | Requirement (short) | NIVO control / evidence | Module | Test | Status |
|------|--------------------|-------------------------|--------|------|--------|
| 1.1.1 | Secure SDLC with security in every sprint | TDD policy, PR review rules, `docs/qa/test-plan.md` | All | CI gate | Designed |
| 1.1.2 | Threat modelling for every design change | `docs/security/threat-model.md`, `00-fmea.md`; FMEA updated per module HLD | All | Review checklist | Designed |
| 1.1.3 | Security stories / abuse cases | `RISK-*` IDs with tests in each LLD | All | per-module `T-*` | Designed |
| 1.1.4 | Trust boundaries and data flows documented | System HLD §4; module HLD §4 | All | Review | Designed |
| 1.1.5 | Documented high-level architecture | `00-system-hld.md`, `architecture/deployment.md`, `architecture/erd.md` | M01 | Review | Designed |
| 1.1.6 | Centralised, vetted security controls | Shared packages (`@nivo/shared`), single `CardEngine`, single audit writer, single `withSystemContext` | All | Lint rules, T-INFRA-013 | Designed |
| 1.1.7 | Secure coding checklists | ESLint security rules, Semgrep custom rules, restricted imports | M01 | CI `security` job | Designed |
| 1.2.x | Authentication architecture | `docs/design/m02-auth/hld.md`; admin hardening in M09 | M02, M09 | T-AUTH-*, T-ADM-050..059 | Designed |
| 1.4.x | Access control architecture (deny by default, single enforcement point) | Permission registry, route declares permission, RLS | M09, M01 | T-ADM-001/002, T-INFRA-010..013 | Designed |
| 1.5.x | Input/output architecture | Zod at the edge of every route; output encoding in React | All | T-*-validation | Designed |
| 1.6.x | Cryptographic architecture | ADR-004; `encryption-and-key-management.md`; key registry | M01, M05 | T-INFRA-001/002, T-ID-001 | Designed |
| 1.7.x | Errors and logging architecture | Error catalog; pino redaction; audit hash chain | M01, M09 | T-INFRA-005, T-ADM-030.. | Designed |
| 1.8.x | Data protection architecture | Classification per module HLD §7; retention schedule | All | T-ID-020.., retention jobs | Designed |
| 1.9.x | Communications architecture | TLS 1.2+, HSTS preload, internal network only for DB | M01 | T-INFRA-020..025 | Designed |
| 1.10.x | Malicious software (SCA, SBOM, supply chain) | `pnpm audit`, Trivy, CycloneDX SBOM, cosign-signed images, lockfile frozen | M01 | T-INFRA-033 | Designed |
| 1.11.x | Business logic architecture | State machines in LLDs (payment, card, proof, approval, lead) | All | state-machine tests | Designed |
| 1.12.x | Secure file upload architecture | `SecureFileService` (magic bytes, AV, re-encode, envelope encrypt) | M05, M07 | T-ID-010.., T-PART-020.. | Designed |
| 1.14.x | Configuration architecture (secrets, build, deploy) | SOPS+age, Docker secrets on tmpfs, signed images, env validated at boot | M01 | T-INFRA-032 | Designed |

## V2 Authentication

| ASVS | Requirement (short) | NIVO control / evidence | Module | Test | Status |
|------|--------------------|-------------------------|--------|------|--------|
| 2.1.1 | Passwords ≥ 12 characters | `Password` zod schema min 12, max 128 | M02 | T-AUTH-002 | Designed |
| 2.1.2 | Allow ≥ 64 chars; no truncation | max 128; Argon2id on full input | M02 | T-AUTH-003 | Designed |
| 2.1.5–2.1.7 | Change password; check against breached list | Bundled top-100k offline denylist, zxcvbn-ts, current-password required | M02 | T-AUTH-004 | Designed |
| 2.1.8 | Strength meter | Client + server zxcvbn-ts | M02 | T-AUTH-005 | Designed |
| 2.1.9 | No composition rules | Length only | M02 | T-AUTH-002 | Designed |
| 2.1.11 | Paste and password managers allowed | `autocomplete` attributes, no paste blocking | M02 | E2E | Designed |
| 2.2.1 | Anti-automation on login | `rateLimit` per IP, per email+IP, per email; lockout | M02, M01 | T-AUTH-050..056 | Designed |
| 2.2.2 | Weak authenticators not offered as sole factor | TOTP only (no SMS/email OTP) | M02 | design review | Designed |
| 2.2.3 | Secure notification after credential change | `auth_password_changed`, `auth_2fa_*` emails | M02, M11 | T-AUTH-024 | Designed |
| 2.3.x | Authenticator lifecycle (activation tokens single use, expiring) | `auth_tokens` HMAC, 24 h verify / 30 min reset / 72 h invite | M02 | T-AUTH-010..025 | Designed |
| 2.4.1 | Password storage with approved KDF | Argon2id (m=64 MiB, t=3, p=1) + versioned pepper | M02 | T-AUTH-001, T-AUTH-084 | Designed |
| 2.5.x | Credential recovery safe, no hints, no password sent | Reset via single-use token in URL fragment; enumeration-safe responses | M02 | T-AUTH-020..025 | Designed |
| 2.7.x | Out-of-band verifier (email link) | Single-use, short-lived, MAC-bound | M02 | T-AUTH-010..016 | Designed |
| 2.8.x | One-time verifier (TOTP) replay protection | `mfa_totp.last_used_step` | M02 | T-AUTH-045 | Designed |
| 2.9.x | Cryptographic verifier | Not used (Phase 2 WebAuthn, `GAP-AUTH-WEBAUTHN`) | M02 | — | N/A (Phase 2) |
| 2.10.x | Service authentication (no default creds, secrets in vault) | SOPS secrets; DB roles per purpose; restricted Stripe key | M01 | T-INFRA-010, 032 | Designed |

## V3 Session management

| ASVS | Requirement (short) | NIVO control / evidence | Module | Test | Status |
|------|--------------------|-------------------------|--------|------|--------|
| 3.1.1 | No session ID in URL | Cookie only | M02 | T-AUTH-030 | Designed |
| 3.2.1 | New session on login | Rotation on login, 2FA, step-up of privileges | M02 | T-AUTH-031 | Designed |
| 3.2.2 | ≥ 128-bit session tokens | 32 random bytes, only SHA-256 stored | M02 | T-AUTH-032 | Designed |
| 3.2.3 | Tokens in secure cookies, not web storage | `__Host-` cookies; no localStorage secrets | M02, Web | T-AUTH-033 | Designed |
| 3.3.1 | Logout invalidates server-side | `sessions.status = revoked`, epoch bump on logout-all | M02 | T-AUTH-034 | Designed |
| 3.3.2 | Absolute and idle timeout | Student 14 d idle / 30 d absolute; staff 15 min idle / 8 h absolute | M02, M09 | T-AUTH-035, T-ADM-052 | Designed |
| 3.3.4 | User can view and revoke sessions | `/auth/sessions` | M02 | T-AUTH-036 | Designed |
| 3.4.1–3.4.5 | Cookie attributes (Secure, HttpOnly, SameSite, `__Host-`) | M02 §2.1; staff cookie `SameSite=Strict` | M02 | T-INFRA-035 | Designed |
| 3.5.x | Token-based sessions | N/A — server-side sessions (ADR-003) | M02 | — | N/A |
| 3.7.1 | Re-authentication for sensitive transactions | Step-up (password/TOTP ≤ 5 min) | M02, M09 | T-ADM-040..049 | Designed |

## V4 Access control

| ASVS | Requirement (short) | NIVO control / evidence | Module | Test | Status |
|------|--------------------|-------------------------|--------|------|--------|
| 4.1.1 | Enforced on trusted server side | Route guard + policy engine; SPA guards are UX only | M09, M06 | T-CARD-030, T-ADM-001 | Designed |
| 4.1.2 | Attributes cannot be manipulated by users | Roles/scopes server-side; no client claims | M09 | T-ADM-001 | Designed |
| 4.1.3 | Least privilege, deny by default | Registry; no wildcards; boot fails for undeclared routes | M09 | T-ADM-002 | Designed |
| 4.1.5 | Access controls fail securely | Fail-closed on entitlement, consent, audit, key service failures | All | per-module failure tests | Designed |
| 4.2.1 | IDOR protection | `NOT_FOUND` for foreign IDs; RLS; ownership predicates | All | T-ID-0xx, T-AUTH-071, T-CON-010 | Designed |
| 4.2.2 | CSRF protection | `X-CSRF-Token` + `__Host-nivo_csrf` + Origin / Fetch-Metadata check | M02 | T-AUTH-037 | Designed |
| 4.3.1 | Admin interfaces use MFA | Mandatory TOTP for staff, DB CHECK | M02, M09 | T-AUTH-040, T-ADM-050 | Designed |
| 4.3.2 | Directory browsing disabled; no leaking metadata | Static server config; no source maps in prod | M01 | T-INFRA-030 | Designed |
| 4.3.3 | Step-up for high-value actions; separation of duties | Maker-checker, SOD rules, step-up | M09 | T-ADM-010..019 | Designed |

## V5 Validation, sanitisation and encoding

| ASVS | Requirement (short) | NIVO control / evidence | Module | Test | Status |
|------|--------------------|-------------------------|--------|------|--------|
| 5.1.1 | HTTP parameter pollution defences | Zod strict objects; single-value query parsing | All | T-*-validation | Designed |
| 5.1.3 | Positive input validation | Zod allow-lists for every field | All | T-AUTH-001.., T-ID-0xx | Designed |
| 5.1.4 | Structured data strongly typed | Zod schemas shared FE/BE | All | CI typecheck | Designed |
| 5.2.x | Sanitisation of rich content | Markdown → sanitised HTML (`rehype-sanitize`); no raw HTML; links `https:` only | M03, M06 | T-LEG-0xx (XSS corpus), T-CARD-0xx | Designed |
| 5.2.5 | Template injection | No server-side string templates from user input; email templates are code | M11 | T-DOC-0xx | Designed |
| 5.2.6 | SSRF protection | No user-supplied server-side fetch; partner link host allow-list; fixed provider URLs | M07 | T-PART-0xx (SSRF/URL tricks) | Designed |
| 5.3.1–5.3.3 | Output encoding, CSP | React escaping; CSP `script-src 'self'` no inline | Web, M01 | T-INFRA-030, 031 | Designed |
| 5.3.4–5.3.5 | Parameterised queries | Drizzle parameterised; no string-built SQL; lint rule | All | Semgrep, T-INFRA-013 | Designed |
| 5.3.6 | JSON injection / CSV formula injection | `csvSafe` encoder; strict JSON content-type | M09, M10 | T-ADM-090.. | Designed |
| 5.3.8 | OS command injection | No shell calls with user input; sandboxed `qpdf`/`exiftool` invoked with argv arrays | M05 | T-ID-061..063 | Designed |
| 5.4.x | Memory/unsafe code | Managed languages; native libs pinned and sandboxed | M05 | T-ID-065 | Designed |
| 5.5.x | Deserialisation | JSON only; no native object deserialisation | All | review | Designed |

## V6 Stored cryptography

| ASVS | Requirement (short) | NIVO control / evidence | Module | Test | Status |
|------|--------------------|-------------------------|--------|------|--------|
| 6.1.1–6.1.3 | Sensitive data identified and encrypted at rest | Identity fields AES-256-GCM; files envelope-encrypted; volumes LUKS | M05, M01 | T-ID-001, T-INFRA-025 | Designed |
| 6.2.1 | Crypto modules fail securely | Decrypt failure → error, never plaintext fallback | M05 | T-ID-002 | Designed |
| 6.2.2 | Industry-proven algorithms | AES-256-GCM, HMAC-SHA256, Argon2id | All | crypto unit tests | Designed |
| 6.2.3–6.2.4 | Correct IV/nonce, algorithm agility | Random 96-bit IV per encryption; key ID prefix | M01 | T-INFRA-001 | Designed |
| 6.2.6 | Nonce reuse prevention | CSPRNG per op; tests assert uniqueness | M01 | T-INFRA-001 | Designed |
| 6.3.1–6.3.3 | Secure random numbers | `crypto.randomBytes`; no `Math.random` (lint) | All | Semgrep | Designed |
| 6.4.1–6.4.2 | Key management (separate from data, rotation, destruction) | KEK in secrets, DEK per record, crypto-shred on deletion, rotation drill | M01, M05 | T-INFRA-041, T-ID-0xx | Designed |

## V7 Error handling and logging

| ASVS | Requirement (short) | NIVO control / evidence | Module | Test | Status |
|------|--------------------|-------------------------|--------|------|--------|
| 7.1.1–7.1.2 | No sensitive data in logs | pino redaction; CI fixture grep | M01 | T-INFRA-005, T-AUTH-083 | Designed |
| 7.1.3 | Security events logged | Audit log events per module §8 | M09 | T-ADM-030 | Designed |
| 7.1.4 | Log has enough context | requestId, route, userIdHash, actorType | M01 | review | Designed |
| 7.2.x | Log access control and integrity | Hash-chained audit, append-only grants, daily WORM checkpoint | M09 | T-ADM-031..036 | Designed |
| 7.3.1 | Log injection prevented | Structured JSON logs only | M01 | unit | Designed |
| 7.4.1 | Generic error messages | Error catalog; `INTERNAL` with request ID | M01 | T-INFRA-0xx | Designed |
| 7.4.3 | Last-resort handler | Fastify error handler maps unknowns to `INTERNAL` | M01 | integration | Designed |

## V8 Data protection

| ASVS | Requirement (short) | NIVO control / evidence | Module | Test | Status |
|------|--------------------|-------------------------|--------|------|--------|
| 8.1.1–8.1.2 | Sensitive data not cached client-side | `Cache-Control: no-store` on authenticated responses | M01 | T-INFRA-030 | Designed |
| 8.1.3 | Minimise sensitive params in requests | No PII in URLs; tokens in fragment; partner URLs use opaque `public_ref` | M02, M07 | T-PART-0xx | Designed |
| 8.1.4 | Anti-caching and anti-bulk-extract controls | Rate limits, reveal velocity caps, export approvals | M05, M09 | T-ADM-070.. | Designed |
| 8.1.5–8.1.6 | Backups of sensitive data tested and encrypted | pgBackRest AES-256, monthly restore drill | M01 | T-INFRA-040 | Designed |
| 8.2.1–8.2.3 | Client-side data protection | No secrets in web storage; masked identity display | Web, M05 | T-AUTH-033 | Designed |
| 8.3.1 | Sensitive data in body not URL | Enforced by route design review | All | review | Designed |
| 8.3.2 | Right to erase and export | DSR saga + export | M05 | T-ID-030..035, T-SEC-010 | Designed |
| 8.3.3 | Privacy notice and consent | M03 consent ledger | M03 | T-LEG-020.. | Designed |
| 8.3.4 | Sensitive data classified; retention enforced | Retention schedule + jobs + heartbeat | M05 | T-ID-020.. | Designed |
| 8.3.6 | Sensitive information held in memory minimised | Decrypt into tmpfs only for export; no plaintext caches | M05 | T-ID-0xx | Designed |

## V9 Communication

| ASVS | Requirement (short) | NIVO control / evidence | Module | Test | Status |
|------|--------------------|-------------------------|--------|------|--------|
| 9.1.1–9.1.3 | TLS for all, strong protocols | TLS 1.2+/1.3, no TLS 1.0/1.1, HSTS preload | M01 | T-INFRA-020, 021 | Designed |
| 9.2.1–9.2.4 | Server comms (DB, object storage, Stripe, email) over TLS with validation | DB `verify-full`; HTTPS to providers | M01 | T-SEC-001 | Designed |

## V10 Malicious code

| ASVS | Requirement (short) | NIVO control / evidence | Module | Test | Status |
|------|--------------------|-------------------------|--------|------|--------|
| 10.1.1 | Code analysis tool | Semgrep OWASP ruleset in CI | M01 | CI | Designed |
| 10.2.x | No backdoors / time bombs / unauthorised phone-home | Code review; CSP `connect-src 'self'`; egress-restricted workers | M01 | T-INFRA-031, T-ID-063 | Designed |
| 10.3.x | Integrity of deployed code | Signed images (cosign), verified at deploy; subresource-free static assets | M01 | deploy gate | Designed |

## V11 Business logic

| ASVS | Requirement (short) | NIVO control / evidence | Module | Test | Status |
|------|--------------------|-------------------------|--------|------|--------|
| 11.1.1 | Sequential step order enforced | Paywall → identity → cards; server guards | M04, M05, M06 | T-CARD-030, T-ID-0xx | Designed |
| 11.1.2 | Realistic human speed; anti-automation | Rate limits on all state-changing public endpoints | All | rate-limit tests | Designed |
| 11.1.3 | Business limits per user | One open lead, one export per 24 h, one pending proof per card | M05, M07, M08 | per-module | Designed |
| 11.1.4 | Anti-automation of expensive operations | Hash semaphore, upload limits, export caps | M02, M05 | T-AUTH-086 | Designed |
| 11.1.5 | Business logic limits tested for abuse | FMEA + negative tests | All | `RISK-*` tests | Designed |
| 11.1.6 | TOCTOU / race conditions handled | Row locks, unique indexes, payload-hash-bound approvals, idempotency keys | M04, M06, M09 | T-CARD-0xx concurrency, T-ADM-01x | Designed |
| 11.1.7 | Monitoring of unusual business events | Alerts on reveal volume, refund volume, DLQ, reconciliation mismatches | M09 | T-ADM-07x | Designed |

## V12 Files and resources

| ASVS | Requirement (short) | NIVO control / evidence | Module | Test | Status |
|------|--------------------|-------------------------|--------|------|--------|
| 12.1.1–12.1.3 | File size limits, per-user quotas | 8 MB, 10 uploads / 10 min | M05, M07 | T-ID-0xx | Designed |
| 12.2.1 | Content-type validation by magic bytes | `detected_mime` vs allow-list | M05 | T-ID-010 | Designed |
| 12.3.1–12.3.6 | Path traversal, no user-controlled paths, no SSRF via files | Server-generated object keys (UUID); no filenames in storage | M05 | T-ID-0xx | Designed |
| 12.4.1–12.4.2 | Files stored outside web root, AV scanned | Private bucket, ClamAV, quarantine → final | M05 | T-ID-010..015 | Designed |
| 12.5.1–12.5.2 | Download hardening (`nosniff`, attachment, no execution) | Streaming with fixed disposition; PDFs stripped of active content | M05 | T-ID-0xx | Designed |
| 12.6.1 | SSRF protection | Fixed outbound destinations; allow-listed partner hosts | M07 | T-PART-0xx | Designed |

## V13 API and web service

| ASVS | Requirement (short) | NIVO control / evidence | Module | Test | Status |
|------|--------------------|-------------------------|--------|------|--------|
| 13.1.1 | Consistent security across all API URLs | Single middleware order | M01 | T-INFRA-0xx | Designed |
| 13.1.3 | API URLs expose no secrets | Tokens never in query; fragment only | M02 | T-AUTH-0xx | Designed |
| 13.1.4 | Authorisation at API layer | Every route declares one permission | M09 | T-ADM-002 | Designed |
| 13.1.5 | Request content types validated | 415 for non-JSON | M01 | integration | Designed |
| 13.2.1–13.2.3 | REST: method allow-lists, CSRF, JSON schema validation | Fastify schemas + CSRF header | All | T-AUTH-037 | Designed |
| 13.2.5 | Content-type allow-list | Same | M01 | integration | Designed |
| 13.2.6 | Message payload signing (webhooks) | Stripe signature + email-provider signature | M04, M11 | T-PAY-010.., T-DOC-0xx | Designed |
| 13.3.x | SOAP/GraphQL | N/A | — | — | N/A |
| 13.4.x | GraphQL | N/A | — | — | N/A |

## V14 Configuration

| ASVS | Requirement (short) | NIVO control / evidence | Module | Test | Status |
|------|--------------------|-------------------------|--------|------|--------|
| 14.1.1–14.1.5 | Reproducible, hardened builds, config integrity | CI pipeline, signed images, branch protection | M01 | CI | Designed |
| 14.2.1–14.2.4 | Dependencies up to date, vulnerable components tracked | `pnpm audit`, Dependabot, Trivy, SBOM | M01 | T-INFRA-033 | Designed |
| 14.2.5 | SBOM | CycloneDX artifact per build | M01 | CI | Designed |
| 14.3.1–14.3.3 | Debug off, stack traces off, server banners removed | `-Server` header, `INTERNAL` mapping | M01 | T-INFRA-030 | Designed |
| 14.4.1–14.4.7 | HTTP security headers | CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP | M01 | T-INFRA-030 | Designed |
| 14.5.1–14.5.4 | HTTP request header validation, Host allow-list | 421 for unknown `Host`; Origin check | M01 | T-INFRA-0xx | Designed |

## Summary and gaps

| Item | Status |
|------|--------|
| Chapters with all applicable rows `Designed` | V1–V14 |
| Open `Gap` rows | None at design level. Pen-test findings (to be added) are tracked in `docs/security/pentest-scope.md` exit criteria |
| `N/A` rows | V2.9 (WebAuthn, Phase 2), V3.5 (no token sessions), V13.3–13.4 (no SOAP/GraphQL) |
| Launch gate | All rows `Built`; pen test report shows zero open High/Critical; this file's "Verified" column populated from the report |

## Sign-off

| Role | Name | Date | Outcome |
|------|------|------|---------|
| Security champion | — | | Pending |
| Engineering lead | — | | Pending |
| External tester | — | | Pending (see pentest scope) |
