# LLD: M07 — Partners

| Field | Value |
|-------|-------|
| Module | M07 |
| Status | Review |
| Depends on HLD | `hld.md` |
| Last updated | 2026-11-24 |

Conventions: UUID primary keys, `timestamptz` UTC, snake_case. Student routes under `/api/partners` plus the launch route `/r/:token`; admin routes under `/api/admin/partners` and `/api/admin/proofs` (admin subdomain). Error shape and codes from `00-error-catalog.md`. Guard order on student routes: session → email verified → Terms current → PaywallGuard (M06) → handler.

## 1. Database

### Enums

| Enum | Values | Notes |
|------|--------|-------|
| `partner_status` | `active`, `paused` | `paused` hides launch buttons and shows a maintenance notice |
| `proof_status` | `draft`, `pending`, `approved`, `rejected`, `withdrawn` | Extends data-model `proof_status` (`pending`, `approved`, `rejected`) with `draft` and `withdrawn` |
| `publish_status` | `draft`, `pending_review`, `approved`, `published`, `rejected` | Shared with M09 |
| `link_health` | `unknown`, `ok`, `down` | |

### Tables

| Table | Column | Type | Constraints | Notes |
|-------|--------|------|-------------|-------|
| partners | id | uuid | PK | |
| | slug | text | NOT NULL, UNIQUE, CHECK `^[a-z0-9]+(-[a-z0-9]+)*$` | e.g. `expatrio`, `vodafone` |
| | name | text | NOT NULL, ≤ 80 | |
| | status | partner_status | NOT NULL default `active` | |
| | disclosure_text_key | text | NOT NULL | M03 text key for "we may receive a commission" disclosure |
| | proof_instructions_i18n | jsonb | NOT NULL | What the student should upload (`{en, de?}`), ≤ 1 000 chars per locale |
| | logo_key | text | | Public asset key |
| | created_at / updated_at | timestamptz | NOT NULL default now() | |
| partner_links | id | uuid | PK | One row per **version** of a link |
| | partner_id | uuid | NOT NULL, FK partners(id) | |
| | label | text | NOT NULL, ≤ 40 | e.g. `default` |
| | version | integer | NOT NULL, UNIQUE (partner_id, label, version) | |
| | publish_status | publish_status | NOT NULL default `draft` | |
| | superseded_at | timestamptz | | |
| | url_template | text | NOT NULL, ≤ 2 000 | Must pass `validateUrlTemplate` |
| | referral_code | text | NOT NULL, CHECK `^[A-Za-z0-9_.\-]{1,64}$` | NIVO's code at the partner (not the consultancy referral of M10) |
| | allowed_hosts | text[] | NOT NULL, 1–5 entries, each lower-case DNS name | Exact host match; `*.` prefix allowed only when explicitly entered |
| | is_primary | boolean | NOT NULL default true | The link used by the partner card |
| | active | boolean | NOT NULL default true | Kill switch; flipping to false is immediate, audited, no approval |
| | health | link_health | NOT NULL default `unknown` | |
| | health_checked_at | timestamptz | | |
| | health_fail_count | smallint | NOT NULL default 0 | |
| | change_note | text | NOT NULL | |
| | created_by / submitted_by / approved_by | uuid | FK users | CHECK `approved_by <> created_by` when set |
| | approval_request_id | uuid | FK approval_requests | |
| | published_at / created_at | timestamptz | | |
| link_clicks | id | bigserial | PK | Append-only |
| | click_id | text | NOT NULL, UNIQUE, 22 chars base64url of 16 CSPRNG bytes | Sent to the partner as `{{click_id}}` |
| | user_id | uuid | FK users ON DELETE SET NULL | NULL after account deletion |
| | partner_id | uuid | NOT NULL, FK | |
| | link_id | uuid | NOT NULL, FK partner_links(id) | Exact version used |
| | card_id | uuid | NOT NULL, FK cards(id) | |
| | referral_code | text | NOT NULL | Snapshot |
| | resolved_url | text | NOT NULL | Contains only referral code, `public_ref`, click id |
| | resolved_host | text | NOT NULL | |
| | is_duplicate | boolean | NOT NULL default false | Same user + link within `partners.click.dedupe_seconds` |
| | ua_family | text | ≤ 40 | Browser/OS family only; no raw User-Agent, no IP |
| | clicked_at | timestamptz | NOT NULL default now() | |
| proofs | id | uuid | PK | |
| | user_id | uuid | NOT NULL, FK users | |
| | card_id | uuid | NOT NULL, FK cards | |
| | partner_id | uuid | NOT NULL, FK partners | |
| | submission_no | smallint | NOT NULL, UNIQUE (user_id, card_id, submission_no) | 1-based; max 5 |
| | status | proof_status | NOT NULL default `draft` | |
| | note | varchar(500) | | Student note |
| | duplicate_flag | boolean | NOT NULL default false | Set at submit |
| | submitted_at | timestamptz | | |
| | reviewed_by | uuid | FK users | |
| | reviewed_at | timestamptz | | |
| | reject_reason_code | text | CHECK in (`UNREADABLE`,`WRONG_DOCUMENT`,`NAME_MISMATCH`,`INCOMPLETE`,`SUSPECTED_DUPLICATE`,`OTHER`) | Required iff `rejected` |
| | reject_reason_note | varchar(300) | | Required when code = `OTHER`; shown to student |
| | files_purge_after | timestamptz | | Set at decision |
| | files_purged_at | timestamptz | | |
| | version | integer | NOT NULL default 1 | |
| | created_at / updated_at | timestamptz | NOT NULL default now() | |
| proof_files | proof_id | uuid | PK part, FK proofs ON DELETE CASCADE | |
| | file_id | uuid | PK part, FK secure_files(id) | `owner_module = 'proof'` (CHECK via trigger) |
| | position | smallint | NOT NULL CHECK 1–3, UNIQUE (proof_id, position) | Displayed as "Proof file N"; original filenames are never stored |
| partner_link_health_checks | id | bigserial | PK | |
| | link_id | uuid | NOT NULL FK | |
| | checked_at | timestamptz | NOT NULL | |
| | http_status | smallint | | |
| | ok | boolean | NOT NULL | |
| | latency_ms | integer | | |
| | error_class | text | | `TIMEOUT`, `TLS`, `DNS`, `HTTP_5XX`, `HTTP_4XX` |

Constraints and triggers:

- `proofs`: partial unique `(user_id, card_id) WHERE status IN ('draft','pending')` — at most one open proof per student and card.
- `proofs`: `CHECK (status <> 'rejected' OR reject_reason_code IS NOT NULL)`; `CHECK (status NOT IN ('approved','rejected') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))`.
- `link_clicks`: no `UPDATE`/`DELETE` grant to `nivo_app`; the account-deletion saga role has column-level `UPDATE (user_id)` only.
- Trigger on `proofs`: forbids any transition other than those in §3 (`draft→pending`, `draft→withdrawn`, `pending→approved|rejected|withdrawn`).

**Additive change required in M05:** `secure_files.content_sha256 bytea NULL` (SHA-256 of the final plaintext, populated by the pipeline only when `purpose = 'proof'`; NULL for identity files). Index `secure_files_sha256 (content_sha256) WHERE content_sha256 IS NOT NULL`.

**Reserved for Phase 2 (not created in Phase 1):** `partner_completion_events(id, partner_id, external_event_id, source enum('webhook','csv'), student_public_ref, occurred_at, received_at, result, payload_hash)` with `UNIQUE (partner_id, external_event_id)`.

### Indexes

| Index | Definition | Purpose |
|-------|-----------|---------|
| `partner_links_live` | UNIQUE (partner_id, label) WHERE publish_status = 'published' AND superseded_at IS NULL | One live version per label |
| `partner_links_primary` | UNIQUE (partner_id) WHERE is_primary AND publish_status = 'published' AND superseded_at IS NULL | One live primary link |
| `link_clicks_user_link` | (user_id, link_id, clicked_at DESC) | Dedupe lookup |
| `link_clicks_partner_time` | (partner_id, clicked_at) | Reporting, export, prune |
| `proofs_queue` | (submitted_at) WHERE status = 'pending' | Review queue (oldest first) |
| `proofs_user_card` | (user_id, card_id, submission_no DESC) | Student history |
| `proofs_purge` | (files_purge_after) WHERE files_purged_at IS NULL AND files_purge_after IS NOT NULL | Retention job |
| `proof_files_file` | (file_id) | Reverse lookup |
| `partner_link_health_time` | (link_id, checked_at DESC) | Health history |

### RLS policies

All tables `ENABLE` + `FORCE ROW LEVEL SECURITY`. Session variables `app.user_id`, `app.role`, `app.perms`.

| Table | Policy | Rule |
|-------|--------|------|
| proofs, proof_files | `student_self` | `USING (user_id = app.user_id)` (proof_files via join on proofs) |
| proofs, proof_files | `admin_review` | `FOR SELECT, UPDATE USING (app.role='admin' AND 'partners.proof.review' = ANY(perms))`; file content access additionally needs `partners.proof.view_files` |
| link_clicks | `student_insert_own`, `admin_view` | Student role may `INSERT` only with `user_id = app.user_id`; no student `SELECT`; admin `SELECT` with `partners.view_clicks` |
| partners, partner_links | `read_published` | Students read through `CardQueryService`/launch only; admin with `partners.view` |
| partner_link_health_checks | admin read, worker write | |
| M10 reporting role | — | No grants on any M07 table |

## 2. API endpoints

### Student

| Method | Path | Permission | Request | Response | Errors | Rate limit | Idempotency |
|--------|------|------------|---------|----------|--------|------------|-------------|
| GET | `/r/:token` | student session, paid | token path param | `302` to resolved partner URL; headers `Referrer-Policy: no-referrer`, `Cache-Control: no-store`; side effects: click row, `startCard` | Not logged in → `302` to login with return path; unpaid → `402` page + payment link; invalid/expired token → `302` to `/dashboard?notice=launch_expired` (or the card page when the slug is derivable); token user ≠ session user → `404`; card Locked → `403` page (`CARD_LOCKED`/`IDENTITY_INCOMPLETE`); partner paused or link inactive/health down → `302` to card page with `notice=partner_unavailable`; resolved URL fails allow-list → `500 INTERNAL` + security alert | 30/min/user, 200/min/IP | Each call logs a click (duplicates flagged); `startCard` is idempotent |
| POST | `/api/partners/cards/:slug/proofs` | student, paid | — | `201 ProofView` (new draft) or `200` existing open draft/pending | 402, 403 (card Locked), 404 (card not a proof-review partner card), 409 `CONFLICT` (card Completed, pending proof exists, or 5 submissions used) | 10/h/user | Natural (returns the existing open proof) |
| GET | `/api/partners/cards/:slug/proofs` | student, paid | — | `{proofs: ProofView[]}` newest first | 402, 404 | 60/min/user | n/a |
| GET | `/api/partners/proofs/:proofId` | student, owner | — | `ProofView` with file statuses | 404 | 120/min/user | n/a |
| POST | `/api/partners/proofs/:proofId/files` | student, owner, paid | multipart `file` | `202 FileStatus` (`pending_scan`) | 400 `UPLOAD_REJECTED`, 404, 409 (proof not `draft`, or already 3 files) | 10/10 min/user | `Idempotency-Key` |
| DELETE | `/api/partners/proofs/:proofId/files/:fileId` | student, owner | — | 204 | 404, 409 (not `draft`) | 20/h/user | Natural |
| POST | `/api/partners/proofs/:proofId/submit` | student, owner, paid | `ProofSubmitInput` | `200 ProofView` (`pending`) | 400 `VALIDATION_FAILED`, 404, 409 (no files, files not `clean` → `FILES_PENDING`, not `draft`, card meanwhile Completed) | 10/h/user | Re-submit of `pending` returns 200, no side effects |
| POST | `/api/partners/proofs/:proofId/withdraw` | student, owner | — | `200 ProofView` (`withdrawn`) | 404, 409 (not `pending`/`draft`) | 10/h/user | Natural |

### Admin

Permissions: `partners.view`, `partners.edit`, `partners.link.review`, `partners.link.publish`, `partners.view_clicks`, `partners.proof.review`, `partners.proof.view_files`.

| Method | Path | Permission | Request | Response | Errors | Rate limit | Idempotency |
|--------|------|------------|---------|----------|--------|------------|-------------|
| GET | `/api/admin/partners` | `partners.view` | — | partners with live link summary and health | 403 | 60/min | n/a |
| POST | `/api/admin/partners` | `partners.edit` | `PartnerInput` | 201 | 400, 409 (slug) | 20/h | `Idempotency-Key` |
| PUT | `/api/admin/partners/:partnerId` | `partners.edit` | `PartnerInput` (slug immutable) | 200 | 400, 404 | 30/h | Natural |
| GET | `/api/admin/partners/:partnerId/links` | `partners.view` | — | link versions | 403 | 60/min | n/a |
| POST | `/api/admin/partners/:partnerId/links` | `partners.edit` | `LinkVersionInput` (new label or new version of label) | 201 draft | 400 (validation details), 409 (draft exists) | 20/h | `Idempotency-Key` |
| PUT | `/api/admin/partners/:partnerId/links/:linkId` | `partners.edit` | `LinkVersionInput` | draft updated | 400, 409 (not draft/rejected) | 60/h | Natural |
| POST | `/api/admin/partners/:partnerId/links/:linkId/preview` | `partners.edit` | `{sampleStudentRef?, sampleClickId?}` | `{resolvedUrl, host, checks: [...]}` (no click row, no partner request) | 400, 404 | 60/h | n/a |
| POST | `/api/admin/partners/:partnerId/links/:linkId/submit` / `approve` / `reject` / `publish` | `partners.edit` / `partners.link.review` / `partners.link.review` / `partners.link.publish` + step-up | `{note?}` (`reject` requires note) | status transition; publish supersedes previous live version | 403, 409 (author = approver; not approved) | 20/h | Natural |
| POST | `/api/admin/partners/:partnerId/links/:linkId/disable` | `partners.link.publish` + step-up | `{reason}` | `active=false` immediately | 400, 404 | 10/h | Natural |
| POST | `/api/admin/partners/:partnerId/links/:linkId/enable` | `partners.link.publish` + step-up | `{reason}` | `active=true` | 409 if health `down` without `confirmHealthOverride: true` | 10/h | Natural |
| GET | `/api/admin/partners/:partnerId/clicks/summary` | `partners.view_clicks` | `?from&to&groupBy=day|card` | counts (non-duplicate and duplicate) | 403 | 30/min | n/a |
| POST | `/api/admin/partners/:partnerId/clicks/export` | `partners.view_clicks` + step-up + approval policy `exports` (M09) | `{from, to, reason}` | `202 {approvalRequestId}`; after approval a one-time download of formula-safe CSV (`click_id, clicked_at, card_slug, referral_code, student_ref, is_duplicate`) | 409 `APPROVAL_REQUIRED`, 400 | 5/day/admin | `Idempotency-Key` |
| GET | `/api/admin/proofs` | `partners.proof.review` | `?status=pending&partnerId&cardId&cursor&limit≤50` | oldest first, with `ageHours`, `overdue`, `duplicateFlag`, `studentPublicRef`, `studentName` (from M02 profile) | 403 | 120/min/admin | n/a |
| GET | `/api/admin/proofs/:proofId` | `partners.proof.review` | — | `AdminProofView` (history of earlier submissions for same card, partner instructions) | 403, 404 | 120/min | n/a |
| GET | `/api/admin/proofs/:proofId/files/:fileId/content` | `partners.proof.view_files` | — | Stream (`inline` for images/PDF, `nosniff`, `no-store`); audit row `proof.file.viewed` written before decrypt | 403, 404, 409 (not `clean`/purged) | 120/h/admin | n/a |
| POST | `/api/admin/proofs/:proofId/approve` | `partners.proof.review` (+ approval policy `partners.proof.approve` when enabled) | `{note?: string(≤300)}` | `200 {proofId, status:'approved', cardCompleted: true, simUnlocked: boolean}` | 403, 404, 409 `CONFLICT` (not `pending`, card already Completed), 409 `APPROVAL_REQUIRED` | 120/h/admin | Re-approve of `approved` returns 200 `{alreadyApproved:true}` |
| POST | `/api/admin/proofs/:proofId/reject` | `partners.proof.review` | `RejectInput` | `200 {status:'rejected'}` | 400, 403, 404, 409 | 120/h/admin | Re-reject of `rejected` returns 200 |

Phase 1 registers **no** inbound partner routes. `POST /api/partners/webhooks/*` and `/api/admin/partners/*/completions/import` return `404` because they are not registered.

### Zod schemas

```ts
// packages/shared/src/partners.ts
import { z } from "zod";

export const PLACEHOLDERS = ["referral_code", "student_id", "click_id"] as const;

export const PartnerInput = z.object({
  slug: z.string().min(2).max(40).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1).max(80),
  status: z.enum(["active", "paused"]),
  disclosureTextKey: z.string().min(1).max(80),
  proofInstructions: z.object({ en: z.string().min(1).max(1000), de: z.string().max(1000).optional() }).strict(),
}).strict();

const Host = z.string().toLowerCase().regex(/^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/);

export const LinkVersionInput = z.object({
  label: z.string().min(1).max(40).regex(/^[a-z0-9-]+$/),
  urlTemplate: z.string().min(12).max(2000),            // validated by validateUrlTemplate() below
  referralCode: z.string().regex(/^[A-Za-z0-9_.\-]{1,64}$/),
  allowedHosts: z.array(Host).min(1).max(5),
  isPrimary: z.boolean(),
  changeNote: z.string().min(5).max(300),
}).strict();

export const ProofSubmitInput = z.object({
  note: z.string().transform((s) => s.trim()).pipe(z.string().max(500)).optional(),
}).strict();

export const RejectReasonCode = z.enum(["UNREADABLE", "WRONG_DOCUMENT", "NAME_MISMATCH", "INCOMPLETE", "SUSPECTED_DUPLICATE", "OTHER"]);
export const RejectInput = z.object({
  reasonCode: RejectReasonCode,
  note: z.string().transform((s) => s.trim()).pipe(z.string().max(300)).optional(),
}).strict().refine((v) => v.reasonCode !== "OTHER" || (v.note && v.note.length >= 10), "note required for OTHER");

export const ProofView = z.object({
  proofId: z.string().uuid(),
  cardSlug: z.string(),
  submissionNo: z.number().int(),
  status: z.enum(["draft", "pending", "approved", "rejected", "withdrawn"]),
  files: z.array(z.object({ fileId: z.string().uuid(), position: z.number().int(), status: z.enum(["pending_scan", "scanning", "clean", "rejected"]), rejectCode: z.string().nullable() })),
  note: z.string().nullable(),
  submittedAt: z.string().datetime().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  rejectReason: z.object({ code: RejectReasonCode, message: z.string(), note: z.string().nullable() }).nullable(),
  canSubmit: z.boolean(), canWithdraw: z.boolean(),
});
```

### URL template validation and resolution

```ts
// Runs at draft save, at submit-for-review, at publish, and again on the resolved URL at click time.
function validateUrlTemplate(tpl: string, allowedHosts: string[]): Result {
  // 1. Only placeholders {{referral_code}}, {{student_id}}, {{click_id}}; any other {{...}} → reject
  // 2. Replace placeholders with the dummy values "REF", "STUDENT", "CLICK" and parse with WHATWG URL
  // 3. protocol === "https:"; port is "" or "443"; username === "" and password === ""
  // 4. hostname (punycode-normalised, lower-case) matches allowedHosts exactly, or "*.x" entry matches a subdomain of x
  // 5. no IP-literal hostnames, no "localhost", no "@" in authority, length ≤ 2048 after resolution
  // 6. placeholders may appear only in path segments, query values, or fragment (never in host, scheme or port)
  // 7. no leftover "{{" or "}}" and no CR/LF
}
function resolve(tpl, { referralCode, publicRef, clickId }) {
  // each value is encodeURIComponent()-encoded; then validate the resolved URL against allowedHosts again
}
```

`student_id` is resolved to `student_profiles.public_ref`. Never the user UUID, email, name or phone.

### Launch token

`v1.<base64url(payload)>.<base64url(HMAC-SHA256(launch_key, "v1." + payloadB64))>`, payload `{u: userId, l: linkId, c: cardId, e: expiresAtUnixSeconds}`. `launch_key` = HKDF purpose `launch` from the M05 key hierarchy (separate from field/file keys). TTL `partners.launch.token_ttl_seconds` (default 1 800). Verification uses constant-time compare; the token is not a secret credential (the session is still required) but is unguessable and user-bound. The `/r/` path segment is redacted in edge and application logs (`/r/[token]`).

## 3. State machines

### Proof

```
draft ──submit──► pending ──approve──► approved
  │                  │  └──reject───► rejected  (student may start a new draft; submission_no + 1)
  └─withdraw─► withdrawn ◄─withdraw──┘
```

| From | To | Actor | Guard | Side effects (same transaction) |
|------|----|-------|-------|--------------------------------|
| (new) | draft | student | card Available/In progress, partner card with `proof_review`, no open proof, submissions < 5 | `submission_no` assigned |
| draft | pending | student | ≥ 1 file, all files `clean`, card not Completed | `submitted_at`, `duplicate_flag` computed, outbox `proof_received`, audit |
| draft | withdrawn | student | | files deleted via SecureFileService |
| pending | approved | admin | row locked; status still `pending`; card not Completed | `reviewed_by/at`; `CardEngine.completeCard(source=proof_approved)` (completes card, evaluates unlock rules, queues `sim_unlocked`, publishes `card.completed`); `files_purge_after = now + 90 d`; outbox `proof_approved`; audit |
| pending | rejected | admin | row locked; reason code (and note for `OTHER`) | `reviewed_by/at`, `files_purge_after = now + 30 d`; outbox `proof_rejected`; audit; card unchanged |
| pending | withdrawn | student | | `files_purge_after = now` |
| approved / rejected / withdrawn | — | terminal | | Files purged at `files_purge_after`; row kept |

Card interplay: if the card becomes Completed by another route (admin override) while a proof is `pending`, approving returns `409`; the reviewer can reject with reason `OTHER` ("card already completed") or leave it to the stale handler: pending proofs of a Completed card are auto-withdrawn by a nightly job step with note `card_completed_elsewhere`.

### Link version

`draft → pending_review → approved → published` (previous live version gets `superseded_at`), `pending_review → rejected → draft`. Approver ≠ author. Publish re-runs `validateUrlTemplate`, requires partner `active`, and enqueues an immediate health check for the new version. `active=false` (kill switch) is independent of the publish state.

### Link health

`unknown → ok` (first success), `ok → down` after `partners.link.health.failure_threshold` (3) consecutive failures, `down → ok` on first success. `down` → students see "partner temporarily unavailable" on the card; admins are alerted; the launch route refuses to redirect.

### Completion adapters (Phase 2 stubs)

Phase 1 ships the interface and flags only. All adapters end in `CardEngine.completeCard`.

```ts
// apps/api/src/modules/partners/completion/adapter.ts
export type CompletionSource = "proof_upload" | "webhook" | "csv";

export interface PartnerCompletionEvent {
  partnerId: string;
  externalEventId: string;          // idempotency key, unique per partner
  studentPublicRef: string;         // resolves to user via student_profiles.public_ref
  occurredAt: Date;
  evidence?: { kind: "url" | "text"; value: string };
}

export interface CompletionAdapter {
  readonly source: CompletionSource;
  readonly enabled: boolean;                                   // from settings; false for webhook/csv in Phase 1
  apply(tx: Tx, ev: PartnerCompletionEvent): Promise<{ result: "completed" | "duplicate" | "unknown_student" | "card_not_open" }>;
}
// Phase 1 registry: [ProofUploadAdapter(enabled=true), WebhookAdapter(enabled=false, apply throws NotImplemented), CsvAdapter(enabled=false, apply throws NotImplemented)]
```

| Option | Status | Phase 2 design constraints (so Phase 1 does not need rework) |
|--------|--------|--------------------------------------------------------------|
| A — Webhook | Stub, flag `partners.completion.webhook.enabled = false`, route not registered | Per-partner secret (stored as secret ref, not in DB), HMAC-SHA256 signature over raw body, timestamp header with ±5 min replay window, source IP allow-list, idempotency by `(partner_id, external_event_id)` in `partner_completion_events`, rate limit, no student PII in payload (only `public_ref`), returns 2xx for duplicates |
| B — CSV import | Stub, flag `partners.completion.csv.enabled = false` | Admin upload (permission `partners.completion.import`), dry-run diff screen, row-level validation, two-person approval (`partners.completion.import` policy), max 5 000 rows, file stored via SecureFileService, formula-safe, per-row idempotency |
| Coexistence | Defined now | If an event completes a card with a `pending` proof, the proof becomes `withdrawn` (`closed_by = partner_completion`); card `completion_source` records `partner_webhook` / `partner_csv` (enum values already reserved in M06) |
| Startup assertion | Implemented in Phase 1 | If a flag is `true` but the adapter reports `NotImplemented`, the API refuses to boot |

## 4. Sequence diagrams

### Happy path — launch and click log

```mermaid
sequenceDiagram
    participant S as Student browser
    participant API as API (M07)
    participant G as PaywallGuard
    participant E as CardEngine (M06)
    participant DB as PostgreSQL
    participant P as Partner site
    S->>API: GET /r/{token} (anchor click, session cookie)
    API->>G: session + isPaid
    API->>API: verify HMAC, exp, token.user == session.user
    API->>DB: load published link version + partner (active?, health)
    API->>DB: BEGIN; card status (not locked)
    API->>API: resolve template ({{referral_code}}, {{student_id}}=public_ref, {{click_id}}), re-validate vs allow-list
    API->>DB: INSERT link_clicks (is_duplicate if same user+link within 5 s)
    API->>E: startCard(tx, user, card) — Available → In progress (idempotent)
    API->>DB: COMMIT
    API-->>S: 302 Location: partner URL (Referrer-Policy: no-referrer)
    S->>P: GET partner URL ?ref=…&sid=NIV…&cid=…
```

### Happy path — proof upload and approval (completes card, unlocks SIM)

```mermaid
sequenceDiagram
    participant S as Student
    participant API as API
    participant SF as SecureFileService (M05)
    participant W as Worker (scan)
    participant A as Admin
    participant E as CardEngine (M06)
    participant DB as PostgreSQL
    participant OB as Outbox (M11)
    S->>API: POST /cards/blocked-account/proofs → draft
    S->>API: POST /proofs/{id}/files (×1–3)
    API->>SF: stage (size, magic bytes, quarantine encrypt)
    SF->>W: scan job → ClamAV → HEIC/EXIF/strip → re-encrypt → clean (+ content_sha256)
    S->>API: POST /proofs/{id}/submit {note}
    API->>DB: pending, duplicate_flag, outbox proof_received
    A->>API: GET /admin/proofs?status=pending (oldest first)
    A->>API: GET …/files/{fileId}/content (audit row first)
    A->>API: POST /admin/proofs/{id}/approve
    API->>DB: BEGIN; SELECT proof FOR UPDATE (pending?)
    API->>DB: UPDATE proofs → approved; files_purge_after
    API->>E: completeCard(tx, {user, card, source: proof_approved, ref: proofId, actor: admin})
    E->>DB: lock user's card_progress rows; card → completed; event
    E->>E: evaluate unlock rules for locked rows (same TX)
    E->>DB: SIM locked → available (if rule now satisfied)
    E->>OB: sim_unlocked (dedupeKey card_unlocked:{user}:{sim})
    API->>OB: proof_approved (dedupeKey proof_approved:{proofId})
    API->>DB: audit_log; COMMIT
    API-->>A: 200 {cardCompleted:true, simUnlocked:true|false}
```

### Failure paths

| Case | Behaviour |
|------|-----------|
| Token tampered / expired / wrong user | No click row; redirect to dashboard notice or `404`; invalid-token metric incremented |
| Unpaid or refunded student hits `/r/…` | `402` page; no click row, no redirect |
| Card Locked (token issued earlier, then locked by admin override) | `403` page; no click row |
| Link inactive, partner paused, health `down` | Redirect to card page with `partner_unavailable`; no click row |
| Resolved URL fails allow-list (data corruption) | `500 INTERNAL`; click not logged; security alert `partners.redirect_validation_failed` |
| Double click within 5 s | Second click logged with `is_duplicate = true`; redirect proceeds |
| Upload infected / bad magic / too large | Same as M05 pipeline: `UPLOAD_REJECTED`; file removed; proof stays `draft` |
| Submit with a pending scan | `409` with `details: FILES_PENDING` |
| Two admins act at once (approve vs reject) | First acquires row lock and commits; second sees status ≠ `pending` → `409 CONFLICT` |
| `completeCard` throws (e.g. invariant, deadlock after retries) | Entire approval transaction rolls back; proof remains `pending`; admin sees `INTERNAL` with request id |
| Outbox insert fails | Rollback as above — no approval without email rows |
| Approve when card already Completed | `409`; reviewer rejects with `OTHER` or lets the nightly job withdraw |
| Student withdraws while admin approves | Row lock decides; loser gets `409` |
| Approval policy enabled (second approver) | First click returns `409 APPROVAL_REQUIRED` and creates request; second admin's approval triggers `applyApproval` which runs the same transaction |
| Student re-uploads same file on another account | `duplicate_flag = true`; reviewer sees warning; no automatic rejection |
| Account deletion mid-review | Saga purges proof files and rows; reviewer queue entry disappears; completed card state (M06) untouched |
| Link health false positive | Requires 3 consecutive failures; admin can re-enable with `confirmHealthOverride` |
| Phase 2 flag turned on | Boot refuses (NotImplemented assertion) |

## 5. Validation rules

| Field | Client | API | DB |
|-------|--------|-----|----|
| `urlTemplate` | Monospace editor with placeholder chips, live "resolved preview" using sample values | `validateUrlTemplate` (https, allow-list, placeholder whitelist, no userinfo/IP/localhost, length) | CHECK `url_template LIKE 'https://%'`, length ≤ 2000 |
| `referralCode` | Pattern hint | Regex `^[A-Za-z0-9_.\-]{1,64}$` | CHECK same regex |
| `allowedHosts` | Chips, lower-cased | `Host` regex; 1–5 entries; template host must match | `text[]` CHECK `cardinality BETWEEN 1 AND 5` |
| `label`, `isPrimary` | | At most one live primary per partner (409 on conflict at publish) | Partial unique index |
| proof file | Accept `.jpg .jpeg .png .pdf .heic .heif`, ≤ 8 MiB, ≤ 3 files; local preview; client-side downscale > 4000 px | M05 pipeline rules (§5 of M05 LLD): size cap, magic bytes vs declared type, scan, HEIC convert, metadata strip, PDF active-content ban | `secure_files` + `proof_files (position 1–3)` |
| `note` | Counter 500 | `ProofSubmitInput` trimmed ≤ 500 | `varchar(500)` |
| `RejectInput` | Reason select; note required for `OTHER` (≥ 10 chars) | Zod refine | `reject_reason_code` CHECK; `varchar(300)` |
| `submission_no` | Button disabled after 5 | Count check, `409` | UNIQUE (user_id, card_id, submission_no) |
| `token` | n/a | Format `v1.x.y`, ≤ 512 chars, HMAC and expiry | n/a |
| `clicks/export` range | Date pickers, max 12 months | `from < to`, ≤ 366 days, reason ≥ 10 chars | n/a |

## 6. Background jobs

All payloads contain ids/cursors only — no names, emails, proof content, URLs with refs.

| Job | Trigger | Retry | Dead letter | Payload rules |
|-----|---------|-------|-------------|---------------|
| `partners.link.health` | Daily 04:00 UTC; also on link publish | HTTP timeout 10 s; 2 immediate retries per link; job-level 3 attempts | `partners.link.health.dead` → alert | `{linkId?}` — No PII. Sends `GET` (no redirect following beyond 3 hops) to the template with test values (`REF`, `HEALTH`, `HEALTH`) from the egress IP; records `partner_link_health_checks`; applies `health` transitions; alerts admins (email to Super Admins, in-app banner) on `down` |
| `partners.proof.retention` | Daily 03:30 UTC | 3 attempts | alert | `{}` — No PII. For proofs with `files_purge_after <= now()` and `files_purged_at IS NULL`: delete secure files (M05 `SecureFileService.delete`), clear `note`, set `files_purged_at` |
| `partners.proof.stale` | Daily 03:45 UTC | 3 | alert | `{}`. Deletes `draft` proofs idle > 14 days (with files); withdraws `pending` proofs whose card is Completed (`card_completed_elsewhere`) |
| `partners.proof.digest` | Weekdays 07:00 UTC | 3 | alert | `{}`. Queues `admin_proof_queue_digest` with counts (pending, overdue > SLA) to users with `partners.proof.review`; skipped when zero pending |
| `partners.clicks.prune` | Monthly | 3 | alert | `{olderThan}`. Deletes `link_clicks` older than 24 months |
| `partners.health.prune` | Monthly | 3 | alert | `{}`. Deletes health check rows older than 90 days |
| `partners.proof.heartbeat` | Every 5 min | none | n/a | `{}`. Emits `proof_retention_last_success_ts`, `proofs_pending_oldest_age_seconds`, `proofs_overdue_count`; alert if retention heartbeat stale > 26 h |
| `partners.account.purge` | Account-deletion saga (M02) | Exponential, 10 | page | `{userId}`. Deletes proof files and proof rows for the user; sets `link_clicks.user_id = NULL`; idempotent |

## 7. Emails

Via M11 outbox with `dedupeKey`. No proof content or filenames in any email.

| Template key | Trigger | Content summary |
|--------------|---------|-----------------|
| `proof_received` | Proof submitted (`dedupeKey proof_received:{proofId}`) | "We received your proof for {card title}. We usually review within 1 business day." Link to card |
| `proof_approved` | Proof approved (`proof_approved:{proofId}`) | "{card title} is completed." Next-step hint if M06 unlocked a card in the same transaction (the unlock itself is announced by `sim_unlocked`) |
| `proof_rejected` | Proof rejected (`proof_rejected:{proofId}`) | Reason message by code (plus admin note if present), what to upload instead, link to upload again (submission n of 5) |
| `admin_proof_queue_digest` | Weekday digest | Internal: counts and oldest age; link to queue; no student data |
| `sim_unlocked` | Queued by M06 inside the approval transaction | See M06 §7 |

## 8. Audit events

| Action | Before/After | Reason required |
|--------|--------------|-----------------|
| `partner.created` / `partner.updated` | field diff | No |
| `partner.link.draft.saved` | template/code/hosts diff | No |
| `partner.link.submitted` / `approved` / `rejected` | `publish_status` transition | Note on reject |
| `partner.link.published` | previous live → new live (template, referral code, hosts) | No (approval referenced) |
| `partner.link.disabled` / `enabled` | `active` flag | **Yes** |
| `partner.link.health.down` / `recovered` | health transition | No (system) |
| `proof.submitted` | draft → pending | No (actor student) |
| `proof.file.viewed` | proof id, file id, admin id (written before decrypt) | No (permission-scoped), rate-limited |
| `proof.approved` | pending → approved; card id; M06 outcome (`cardCompleted`, `simUnlocked`) | Optional note |
| `proof.rejected` | pending → rejected; reason code | Yes (`reasonCode`) |
| `proof.withdrawn` | → withdrawn | No |
| `proof.files.purged` | proof id, count, reason (`retention`/`account_deletion`) | No (system) |
| `clicks.export.requested` / `downloaded` | range, row count, file hash | **Yes** |
| `partner.redirect_validation_failed` | link id | No (security alert) |

## 9. Config / admin settings

Published through M09 settings workflow. ✱ = maker-checker.

| Key | Default | Bounds | Notes |
|-----|---------|--------|-------|
| `partners.launch.token_ttl_seconds` | 1 800 | 60–3 600 | |
| `partners.click.dedupe_seconds` | 5 | 1–60 | |
| `partners.clicks.retention_months` | 24 | 6–36 | |
| `partners.proof.max_files` | 3 | 1–5 | |
| `partners.proof.max_bytes` | 8 388 608 | ≤ 10 485 760 | Same as M05 |
| `partners.proof.max_submissions_per_card` | 5 | 1–10 | |
| `partners.proof.note_max_chars` | 500 | 100–1000 | |
| `partners.proof.approved_file_retention_days` ✱ | 90 | 7–365 | `GAP-PART-PROOF-RETENTION` |
| `partners.proof.rejected_file_retention_days` ✱ | 30 | 1–90 | |
| `partners.proof.draft_ttl_days` | 14 | 1–30 | |
| `partners.proof.sla_hours` | 24 | 4–120 | Overdue marker in queue |
| `partners.proof.approval_policy_enabled` ✱ | false | boolean | Turns on second approver for proof approval (can be limited per partner in M09 policy) |
| `partners.link.health.enabled` | true | | |
| `partners.link.health.failure_threshold` | 3 | 2–10 | |
| `partners.digest.enabled` | true | | |
| `partners.completion.webhook.enabled` | false | locked to false in Phase 1 | Option A stub |
| `partners.completion.csv.enabled` | false | locked to false in Phase 1 | Option B stub |

Seed (placeholder values until `GAP-PARTNER-LINKS` resolves; templates are inactive until an admin publishes real ones):

| Partner | Card | Template (placeholder) | Allowed hosts |
|---------|------|------------------------|---------------|
| Expatrio (blocked account) | `blocked-account` | `https://www.example-expatrio.test/signup?ref={{referral_code}}&sid={{student_id}}&cid={{click_id}}` | `www.example-expatrio.test` |
| SIM partner (Vodafone) | `sim` | `https://www.example-vodafone.test/student?partner={{referral_code}}&sid={{student_id}}&cid={{click_id}}` | `www.example-vodafone.test` |

(`.test` hosts exist only in the seed so staging cannot redirect to real sites; production publish requires real hosts and approval.)

## 10. Logging and redaction

Never logged: launch tokens or the `/r/` path segment (edge and app access logs record `/r/[token]`), resolved partner URLs (they carry `public_ref` and `click_id`; logs hold `clickId` and `partnerSlug` only), proof file bytes, base64 blobs, original upload filenames, proof notes and reject notes (stored in DB, not logs), reviewer free text, `Cookie`/`Authorization`/CSRF headers, partner webhook secrets (Phase 2), the HKDF launch key.

Logged: request id, user id (UUID), partner slug, link id, card slug, click id, click outcome (`logged`, `duplicate`, `blocked_unpaid`, `blocked_locked`, `invalid_token`, `partner_unavailable`), proof id and state transitions, reject code, file ids and statuses, reviewer admin id, job counts, health-check outcomes (host + status code, no query string).

## 11. Test cases

Existing IDs keep their meaning from `00-traceability.md`: `T-PART-001`, `T-PART-010`.

| ID | Layer | Description | Expected |
|----|-------|-------------|----------|
| T-PART-001 | integration + e2e | Paid student clicks the card's partner button | One `link_clicks` row (user, partner, link version, card, referral code snapshot, unique `click_id`, host, `ua_family`); `302` to partner with `ref`, `sid` (= `public_ref`) and `cid` (= click id) resolved; card moves Available → In progress in the same transaction (REQ-PART-01, REQ-PART-03, CTRL-PART-TRACK) |
| T-PART-002 | unit | `validateUrlTemplate`: unknown placeholder `{{email}}`, `http://`, host not in allow-list, userinfo `https://a@b`, IP literal, `localhost`, placeholder in host, CRLF, > 2 000 chars | Each rejected with specific message (REQ-PART-04, CTRL-PART-REDIRECT) |
| T-PART-003 | unit | `resolve`: values with `&`, `#`, spaces, unicode | Percent-encoded; resolved URL still passes allow-list |
| T-PART-004 | integration | Corrupt stored template (direct DB edit) to an off-list host, then click | `500`, no redirect, no click row, security alert (CTRL-PART-REDIRECT) |
| T-PART-005 | unit | Token sign/verify: tampered payload, wrong key, expired, truncated, wrong version | All rejected; constant-time compare used |
| T-PART-006 | integration | Student B uses student A's token | `404`; no click row (RISK-PART-CLICK-FORGERY) |
| T-PART-007 | integration | Unpaid / refunded student opens a valid-looking token | `402`; no click row (CTRL-CARD-PAYWALL) |
| T-PART-008 | integration | Card Locked when token used | `403`; no click row |
| T-PART-009 | integration | Two clicks within 5 s, then one after 10 s | Three rows; first and third `is_duplicate=false`, second `true`; summary counts exclude duplicates |
| T-PART-010 | integration + e2e | Student uploads proof (JPG), submits; admin approves; second case: admin rejects with `UNREADABLE`; student resubmits (submission 2) and is approved | Pending → approved completes card; reject keeps card In progress and queues `proof_rejected` with reason; resubmission allowed; statuses visible to student (REQ-PART-02, CTRL-PART-PROOF) |
| T-PART-011 | integration | Proof file infected (EICAR) / wrong magic / 8 MiB + 1 byte / HEIC | `UPLOAD_REJECTED` for first three; HEIC converted to JPEG; proof stays draft |
| T-PART-012 | integration | Submit with no files; with a file still `pending_scan` | `409` (`FILES_PENDING` for the latter) |
| T-PART-013 | integration | Second draft while one is open; sixth submission | `409` both (unique index + count) |
| T-PART-014 | integration | Proof for a Locked card; for Completed card; for card without `proof_review` | 403 / 409 / 404 |
| T-PART-015 | integration | Approve Card 1 proof while Card 3 already Completed (rule: all) | In the same transaction: Card 1 Completed, SIM Available, one `sim_unlocked` outbox row, `proof_approved` outbox row, audit written; response `simUnlocked: true` (REQ-PART-05, REQ-CARD-10) |
| T-PART-016 | integration | Approve when SIM prerequisites not yet met | Card completed; SIM stays Locked; no `sim_unlocked` row |
| T-PART-017 | integration | Fault injection: outbox insert fails / `completeCard` throws | Full rollback: proof `pending`, card unchanged, no emails |
| T-PART-018 | integration | Concurrent approve and reject (50 runs) | Exactly one wins; loser `409`; no double completion; one set of outbox rows |
| T-PART-019 | integration | Approve when card already Completed via override | `409`; nightly job withdraws proof with `card_completed_elsewhere` |
| T-PART-020 | integration | Duplicate evidence: identical file submitted by two accounts | Second proof `duplicate_flag = true`; reviewer UI shows warning without naming the other account; same-account resubmission not flagged (CTRL-PART-PROOF) |
| T-PART-021 | integration | Admin views proof file | `proof.file.viewed` audit row exists **before** decrypt; `no-store`, `nosniff` headers; admin without `partners.proof.view_files` gets 403 |
| T-PART-022 | integration | Approval policy enabled | First approve → `409 APPROVAL_REQUIRED`; second admin approves → same atomic transaction runs; author cannot be the second approver |
| T-PART-023 | e2e | Student sees proof history with status and reject message; mobile viewport upload | Matches states; no filename shown |
| T-PART-024 | integration | Retention job: approved proof at day 91, rejected at day 31, withdrawn at day 1 | Files deleted from bucket and `secure_files`; note cleared; metadata kept; idempotent re-run |
| T-PART-025 | integration | Account-deletion saga | Proof files/rows removed; `link_clicks.user_id` NULL; click rows remain; `public_ref` gone so rows unlinkable (REQ-SEC-02) |
| T-PART-030 | integration | Phase 1 inbound routes | `POST /api/partners/webhooks/x` and CSV import path → `404` (not registered) |
| T-PART-031 | unit | `CompletionAdapter` contract tests with a fake adapter | Idempotent on `(partnerId, externalEventId)`; unknown student → `unknown_student`; funnels into `completeCard` with source `partner_webhook` (REQ-PART-06) |
| T-PART-032 | integration | Set `partners.completion.webhook.enabled = true` in Phase 1 | API refuses to boot (NotImplemented assertion) |
| T-PART-033 | unit | Coexistence rule | Event completing a card with a `pending` proof withdraws that proof (fake adapter) |
| T-PART-040 | integration | Health job: link returning 500 three days in a row; then 200 | `ok → down` after 3rd failure, admin alert, launch refuses; recovery sets `ok` (REQ-PART-08, RISK-PART-BAD-LINK) |
| T-PART-041 | integration | Partner `paused` or link `active=false` | Card page shows maintenance notice; `/r/…` redirects to card page; no click row |
| T-PART-042 | integration | Link publish flow | Author cannot approve; publish supersedes previous version; clicks reference the exact version id |
| T-PART-043 | integration | Kill switch | `disable` takes effect on next request; audit with reason |
| T-PART-044 | security | Log-redaction suite with sentinel token and `public_ref` | `/r/[token]` in access logs; no resolved URL or sentinel in logs/Sentry (CTRL-PART-LOG) |
| T-PART-045 | security | IDOR: student requests another student's proof, file, submit, withdraw | 404 for all; admin routes with student session → 403 |
