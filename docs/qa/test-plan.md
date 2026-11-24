# Master Test Plan

| Field | Value |
|-------|-------|
| Status | Review |
| Owner | NIVO Engineering (QA lead = engineering lead until a tester is hired) |
| Last updated | 2026-11-24 |
| Scope | Phase 1 modules M01–M11 (M12 = launch gate, see `go-live-checklist.md`) |
| Inputs | `docs/design/00-traceability.md`, per-module LLD §11 test tables, `docs/qa/acceptance-tests.md`, `docs/qa/tdd-foundation.md`, `docs/security/asvs-checklist.md`, `docs/security/pentest-scope.md` |
| Decision locked | **TDD**: a failing test exists before production code for every requirement (`REQ-*`) and every risk (`RISK-*`) |

## 1. Test strategy

### 1.1 TDD policy

1. For every `T-*` row in a module LLD, write the test first (red), commit it, then implement until green. Pull requests that add production code without a corresponding test ID are rejected in review.
2. Bug fixes start with a failing regression test named `T-<MOD>-<n>` added to the LLD table in the same PR.
3. Domain logic (card engine, approval engine, policy engine, payment state machine, retention formulas, validators) lives in pure functions inside `packages/shared` so it is unit-testable without I/O; adapters are thin.
4. Each LLD test row has: ID, layer, description, expected result. IDs are never reused (ID scheme rule 1).
5. `00-traceability.md` is the contract: every `REQ-*` must map to ≥ 1 `T-*`. A CI script (`pnpm check:traceability`) parses the matrix and the LLDs and fails if a REQ has no existing test ID or a referenced `T-*` does not exist in any LLD.

### 1.2 Test pyramid and tools

| Layer | Tooling | Runs | Share of tests | What it covers |
|-------|---------|------|---------------|----------------|
| Unit | Vitest, fast-check (property tests) | Every commit, < 2 min | ~60 % | Validators (Zod), crypto, SIM/unlock evaluator, state machines, policy `can()`, approval engine, CSV encoder, markdown sanitiser, masking, retention date formulas, template renderers |
| Integration (DB) | Vitest + Testcontainers PostgreSQL 16 (real RLS, triggers, roles, `nivo_app` without BYPASSRLS), ClamAV container, MinIO-compatible S3, Mailpit | Every PR, < 10 min | ~25 % | Migrations, RLS matrices, triggers (append-only, grandfathering, self-approval), repositories, API routes through `fastify.inject`, queue jobs with pg-boss, webhook processor with Stripe fixtures |
| Contract | OpenAPI schema validation (`docs/architecture/api.openapi.yaml`), Stripe test events, Brevo webhook fixtures | Every PR | small | Response/request schemas, no plaintext identity fields (T-ID-064), error shape |
| E2E | Playwright (desktop Chromium + mobile WebKit/Chromium emulation), axe-core | PR smoke subset; full on `main` and nightly | ~10 % | Acceptance scenarios 1–10 and the journeys in `docs/product/user-journeys.md` |
| Security | Semgrep, gitleaks, `pnpm audit`, Trivy, OWASP ZAP baseline + authenticated scan, custom authz-matrix generator | PR (static), nightly (ZAP) | ongoing | `docs/security/asvs-checklist.md` |
| Mutation | Stryker on critical domains | Weekly + before release | — | `@nivo/shared` cards/permissions/crypto, approval engine, payment state machine, audit chain; threshold ≥ 90 % branch score (≥ 80 % elsewhere) |
| Performance | k6 (staging) | Before launch and quarterly | — | See §6 |
| Accessibility | axe in Playwright, manual screen-reader and keyboard runs | PR (axe), pre-launch (manual) | — | WCAG 2.1 AA (BFSG) |
| Infra / drills | `verify-infra` scripts, restore drill, KEK rotation drill | Monthly / quarterly | — | M01 T-INFRA-020…043 |
| Manual / UAT | Exploratory checklist, usability sessions (5 students) | Pre-launch | — | `docs/design/ux/usability-notes.md` |

### 1.3 Coverage and quality gates

| Metric | Gate |
|--------|------|
| Line coverage `packages/shared` | ≥ 95 % |
| Branch coverage critical domains (cards, permissions, approvals, payments, crypto, audit) | ≥ 90 % |
| Line coverage `apps/api` modules | ≥ 85 % |
| Line coverage `apps/web` logic (hooks, guards, validators) | ≥ 80 % |
| Mutation score critical domains | ≥ 90 % |
| Authorisation matrix | 100 % of routes × system roles; build fails for a route without a declared permission (T-ADM-001/002) |
| RLS | Every table in `public` has RLS enabled and forced (T-INFRA-013); matrices per module green |
| Requirements traceability | 100 % REQ with ≥ 1 passing T-ID |
| Flaky tests | Quarantine within 24 h; none allowed in security or payment suites |

## 2. Test ID namespaces and ownership

| Prefix | Module | Defined in | Existing range | Notes |
|--------|--------|------------|----------------|-------|
| `T-INFRA-` / `T-SEC-` | M01 | `m01-infra/lld.md` §11; `T-SEC-001`, `T-SEC-010` cross-cutting | 001…043 | `T-SEC-001` = REQ-SEC-01 bundle; `T-SEC-010` = deletion button E2E |
| `T-AUTH-` | M02 | `m02-auth/lld.md` | 001…086 | |
| `T-LEG-` | M03 | `m03-legal/lld.md` | 001…033 | |
| `T-PAY-` | M04 | `m04-payment/lld.md` | 001…072 | |
| `T-ID-` | M05 | `m05-identity/lld.md` | 001…065 | |
| `T-CARD-` | M06 | `m06-cards/lld.md` | 001…063 | |
| `T-PART-` | M07 | `m07-partners/lld.md` | 001…045 | |
| `T-ACC-` | M08 | `m08-accommodation/lld.md` | 001…072 | |
| `T-ADM-` | M09 | `m09-admin/lld.md` | 001…099 | |
| `T-CON-` | M10 | `m10-consultancy/lld.md` | 001…065 | |
| `T-DOC-` | M11 | `m11-emails/lld.md` | per LLD | |
| `T-UX-` | M02–M06 (onboarding) | `docs/design/ux/onboarding-spec.md`, E2E | `T-UX-001` and extensions | Stepper, copy keys, a11y |
| `T-E2E-` | Cross-module acceptance | `docs/qa/acceptance-tests.md` | 01…10 (+ extras) | Playwright in `apps/web/e2e` |

A requirement may be covered by tests in several modules; the matrix names the primary one.

## 3. Test levels in detail

### 3.1 Unit (fast, no I/O)

- Pure domain functions and validators; fast-check properties:
  - Passwords: any string 12–128 chars accepted, 11 rejected, unicode normalisation stable (T-AUTH-002/003).
  - SIM unlock: for any progress set and rule, automatic evaluation never lowers a status (grandfathering property, T-CARD-020s).
  - CSV encoder: output never starts with `=`, `+`, `-`, `@`, tab or CR after encoding (T-ADM-090s).
  - URL validator for partner links: rejects userinfo tricks, punycode lookalikes, IP literals, non-HTTPS, redirects (T-PART).
  - Retention formula: `delete_after <= completed_at + 90 d` for all inputs (T-ID-020s).
  - Scope union algebra for permissions (T-ADM-004).
- Crypto: round trip, tamper detection (GCM tag), IV uniqueness, key ID routing (T-INFRA-001/002, T-ID-001).

### 3.2 Integration (database and queues)

- Run migrations from zero and from the previous release (expand–contract check).
- RLS: for each module's policy matrix, assert rows visible per actor (anon, student A, student B, staff, consultancy A/B, system) — generated from the LLD tables.
- Triggers: audit append-only, consent ledger append-only, card regression guard, self-approval guard, last Super Admin guard, consultancy attribution lock.
- Concurrency: parallel completions of Card 1 and Card 3 produce exactly one SIM unlock and one outbox row; parallel checkouts; webhook duplicates; approval decisions racing (Promise.all with isolated connections).
- Jobs: retries, DLQ routing, idempotency, payload PII lint (payloads validated by Zod; test fails if a key is `email`, `name`, `phone`, etc.).
- Webhooks: Stripe events from fixtures with real signature computation using the test secret; time tolerance; replay; out-of-order sequences (T-PAY-010…019).
- Failure injection: ClamAV down, S3 error, Stripe API 500, email provider 429, DB statement timeout, key canary failure.

### 3.3 End-to-end

Playwright projects: `desktop-chromium` (1280 px), `mobile-chromium` (Pixel 7), `mobile-webkit` (iPhone 14, HEIC upload path).

| Test | Acceptance # | Modules | Key assertions |
|------|--------------|---------|----------------|
| T-E2E-01 | 1 | M02, M04 | Register → verify (Mailpit link) → login → only payment reachable; stepper shows step 3 |
| T-E2E-02 | 2 | M04, M06, M11 | Stripe test payment through hosted page (Stripe test mode in staging; in CI the webhook is posted with a signed fixture) → dashboard unlocks only after webhook → receipt email with invoice PDF → Documents list |
| T-E2E-03 | 3 | M05, M06 | Identity gate before Card 1; Cards 1+3 available after identity; SIM locked showing progress `0/2` (default rule); Card 4 "Coming soon" with Notify me |
| T-E2E-04 | 4 | M07 | Card 1 button opens tracked partner URL; click row exists with `click_id` |
| T-E2E-05 | 5 | M07, M06, M09, M11 | Student uploads proof; admin B approves; Card 1 Completed; SIM unlocked in same transaction; email queued; SIM link works |
| T-E2E-06 | 6 | M09, M06 | Admin adds insurance card as SIM requirement (draft → approve → publish); a student who has not unlocked SIM must complete it; a student already unlocked stays unlocked (grandfathering) |
| T-E2E-07 | 7 | M06, M04 | Unpaid student deep-links to `/dashboard/cards/blocked-account` → redirected to payment; API returns 402 |
| T-E2E-08 | 8 | M08, M11, M09 | Accommodation form → agent notification ≤ 60 s (Mailpit timestamp) → agent updates status → student sees status |
| T-E2E-09 | 9 | M09, M07 | Admin changes partner link (draft → second admin approves → publish); student's next click uses new URL without a deployment |
| T-E2E-10 | 10 | M03, M05 | Six legal pages reachable; banner shows three equal buttons; Terms version saved; deletion request button works |
| T-E2E-11 | extra | M05 | Identity encryption (DB contains no plaintext), retention job purges at due date (time-travel clock) |
| T-E2E-12 | extra | M10 | Consultancy A cannot see consultancy B students (UI + API) |
| T-E2E-13 | extra | M09 | Maker-checker: requester cannot approve own request; refund executes after second admin approves |
| T-E2E-14 | extra | M09 | Audit tamper detection: modify a row via SQL in test DB → verification job alerts |
| T-E2E-15 | extra | M03 | Terms v2 published (author A, approver B) → student blocked until re-accept; paid student keeps access afterwards |
| T-E2E-16 | extra | M02 | Lost-2FA admin flow via recovery code and admin reset (approval) |

Each E2E file tags tests with the `REQ-*` IDs it proves. Journeys in `docs/product/user-journeys.md` map 1:1 to E2E specs (J1…J12).

### 3.4 Security tests

- Static: Semgrep OWASP + custom rules (no `withSystemContext` outside allow-list, no `dangerouslySetInnerHTML`, no `Math.random` for secrets, no string-concatenated SQL); gitleaks; dependency audit.
- Dynamic: ZAP baseline per PR against the preview environment; authenticated active scan nightly on staging using seeded accounts.
- Authorisation matrix: generated from the route registry × system roles × sample custom role × scope cases (`authz-matrix.json`).
- Targeted suites: CSRF, session fixation, step-up bypass, TOTP replay, TOCTOU on approvals, IDOR sweeps, SSRF/URL tricks, XSS payload corpus in names/notes/referral/markdown, upload polyglots and bombs, webhook forgery.
- Pen test per `docs/security/pentest-scope.md`.

### 3.5 Privacy and compliance tests

| Area | Test |
|------|------|
| Cookies | T-LEG-010…013: no non-essential storage before consent; three equal buttons (computed styles); evidence recorded; withdrawal removes registry cookies |
| Consent | T-LEG-020…033: version/hash stored; stale version rejected; re-accept guard |
| Retention | T-ID-020…028: purge, hard cap, drafts, heartbeat alerts, restore + ledger replay |
| DSR | T-ID-030…035, T-SEC-010: export contents, deletion saga completeness (per-module "nothing left" queries) |
| Logs | T-INFRA-005, T-AUTH-083: redaction fixtures |
| Minimisation | Static OpenAPI check: no endpoint returns `*_enc`; queue payload lint |

### 3.6 Accessibility

- axe-core in every E2E page visit (no serious/critical violations).
- Manual: keyboard-only run of onboarding, banner focus trap, 200 % zoom, reduced-motion, NVDA/VoiceOver smoke on register, pay, identity, dashboard.
- Contrast check of brand tokens (Orange `#FB770B` text on Beige `#F5EFE6` fails AA for small text → use Charcoal `#2D2A26` for text, Orange for large UI elements only; test in `T-UX-0xx`).

## 4. Environments and data

| Environment | Purpose | Data | Services |
|-------------|---------|------|----------|
| Local | Developer loop | Seed fixtures, in-memory repositories for unit tests | Docker compose: Postgres, Mailpit, ClamAV, MinIO, Stripe CLI |
| CI | Automated gates | Generated | PG service container, stubs for Stripe/Brevo, ClamAV container for upload tests |
| Staging | E2E, ZAP, load, pen test, UAT | **Synthetic only**; never real PII | Hetzner VM; Stripe **test mode**; Mailpit + allow-listed real inbox |
| Production | Smoke only after deploy (read-only checks, synthetic canary account) | Real | Live |

Test data builders (`packages/shared/test`) create students in each state (unverified, verified-unpaid, processing, paid, identity draft/complete, each card status) and admin users per role. Time-dependent tests use an injectable clock; jobs expose `runOnce(now)`.

## 5. Entry and exit criteria

| Phase | Entry | Exit |
|-------|-------|------|
| Module build (per LLD) | LLD Status ≥ Review; tests listed | All module `T-*` green; coverage gates met; traceability script passes |
| Integration | Modules merged; migrations apply from scratch | Cross-module sequences (paid unlock, identity gate, SIM unlock, deletion saga, publish settings) green |
| Release candidate | `main` green; staging deployed from tag; `verify-infra` passes | Acceptance 1–10 pass on desktop and mobile; ZAP baseline clean of High; mutation thresholds met |
| Pen test | Prerequisites checklist in `pentest-scope.md` | Zero open High/Critical |
| Go-live | All items in `go-live-checklist.md` ticked, lawyer/tax sign-off recorded in `d5-signoff.md` | Production canary green for 24 h |

## 6. Non-functional testing

| Aspect | Target | Method |
|--------|--------|--------|
| Page load | Public/auth JS ≤ 200 KB first load; LCP ≤ 2.5 s on mid-range mobile over 4G | Lighthouse CI budget |
| API latency | p95 ≤ 300 ms for reads, ≤ 800 ms for writes (excluding hashing) at 50 concurrent users | k6 |
| Login throughput | Argon2id with concurrency semaphore sheds load without crashing (T-AUTH-086) | k6 burst |
| Registration burst | 200 registrations in 10 min (campaign peak) without errors; email queue drains ≤ 2 min | k6 + Mailpit |
| Webhook burst | 100 events / min processed in order-insensitive fashion, no duplicates | Fixtures |
| Lead notification | Created → email sent ≤ 60 s p95 (REQ-ACC-01) | Timed integration + staging E2E |
| Backup/restore | RPO ≤ 5 min, RTO ≤ 4 h | Monthly drill (T-INFRA-040) |
| Scalability sanity | Single app VM sustains 1 000 active sessions; DB connections pooled | k6 soak 30 min |
| Resilience | Chaos cases: DB restart, queue stall, ClamAV down, Stripe 500s | Scripted failure injection in integration/staging |

## 7. Defect management

| Severity | Definition | Fix SLA | Release impact |
|----------|-----------|---------|----------------|
| S1 | Security or data-protection breach, payment bypass, data loss | Same day | Blocks release; incident plan |
| S2 | Core journey broken (cannot register, pay, submit identity, complete card) | 2 working days | Blocks release |
| S3 | Feature degraded with workaround | Next release | Allowed with owner |
| S4 | Cosmetic / copy | Backlog | None |

Defects are tracked in the repository issue tracker with labels `severity:S1..S4`, `module:Mnn`, linked `REQ-*`/`T-*`. Every fix adds or updates a test ID.

## 8. Reporting

- CI summary per PR: unit/integration/e2e results, coverage delta, mutation score trend, ZAP alerts, traceability check.
- Weekly quality report during build: test counts by module vs LLD tables (planned vs implemented), open S1/S2, gap register High items.
- Release test report appended to `d5-signoff.md` evidence (acceptance 1–10, pen-test attestation, restore drill result).

## 9. CI pipeline mapping (extends M01 CI/CD)

| Stage | Tests |
|-------|-------|
| `lint` | ESLint (security + restricted imports), Prettier, `pnpm check:traceability`, `pnpm gen:permissions-doc --check` |
| `typecheck` | `tsc` across the monorepo |
| `unit` | Vitest (`@nivo/shared`, `@nivo/api` unit, `@nivo/web` logic) with coverage gates |
| `integration` | Postgres 16 + ClamAV + MinIO + Mailpit services; migrations; RLS matrices; API tests; jobs |
| `security` | Semgrep, gitleaks, `pnpm audit --prod --audit-level=high`, Trivy, SBOM |
| `e2e` | Playwright smoke on PR; full on `main`; axe included |
| `nightly` | ZAP authenticated scan, full E2E on mobile profiles, mutation (weekly), restore verification script |
| `release` | Build, sign, deploy staging, `verify-infra`, manual approval, deploy production, post-deploy canary |

Current repository state: `.github/workflows/ci.yml` runs typecheck and tests; stages above are added as the corresponding modules ship (see `docs/qa/tdd-foundation.md` "Next hardening").

## 10. Risks to the test effort

| Risk | Mitigation |
|------|-----------|
| Stripe hosted checkout cannot be automated reliably in CI | CI posts signed fixtures to the webhook; one manual/automated staging run in Stripe test mode per release |
| HEIC and AV tests need native libs | Docker image used locally and in CI includes libheif, ClamAV with EICAR |
| Time-based flows (retention 30/90 d, 15-min idle) | Injectable clock and job `runOnce` |
| Small team: tests lag code | TDD gate, traceability script, weekly planned-vs-implemented report |
| Synthetic data masks real-world input (names with diacritics, long addresses) | Property tests with unicode corpora; usability sessions with real students on staging using their own fake data |
