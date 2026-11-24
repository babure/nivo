# LLD: M05 — Identity

| Field | Value |
|-------|-------|
| Module | M05 |
| Status | Review |
| Depends on HLD | `hld.md` |
| Last updated | 2026-11-24 |

Conventions: UUID primary keys, `timestamptz` UTC, snake_case columns, `user_id` references `users.id` (`user_kind = 'student'`). Error shape and codes from `00-error-catalog.md`. Student routes live under `/api/identity`, admin routes under `/api/admin/identity` on the admin subdomain.

## 1. Database

### Tables

**`identity_records`** — one live record per student (data model name `identity_records`).

| Table | Column | Type | Constraints | Notes |
|-------|--------|------|-------------|-------|
| identity_records | id | uuid | PK, default `gen_random_uuid()` | Used in AAD |
| | user_id | uuid | NOT NULL, FK users(id) | |
| | status | `identity_status` enum | NOT NULL; `draft` \| `complete` \| `deleting` \| `deleted` | |
| | full_name_enc | bytea | NULL until entered | Name as on passport |
| | father_name_enc | bytea | | |
| | mother_name_enc | bytea | | |
| | current_address_enc | bytea | | Encrypted canonical JSON `{line1,line2?,city,region?,postalCode,country}` |
| | permanent_address_enc | bytea | | Same shape; when `permanent_same_as_current` the value is a copy (not a pointer) so edits stay independent |
| | permanent_same_as_current | boolean | NOT NULL default false | UI convenience only |
| | phone_enc | bytea | | E.164 |
| | email_enc | bytea | | Contact email (may differ from login email) |
| | passport_number_enc | bytea | | Upper-case, no spaces |
| | passport_scan_file_id | uuid | FK secure_files(id) DEFERRABLE | Must be `clean` to submit |
| | signature_file_id | uuid | FK secure_files(id) DEFERRABLE | PNG, `clean` |
| | display_mask | jsonb | NOT NULL default `'{}'` | Masked previews computed at write; no plaintext |
| | key_version | smallint | NOT NULL | KEK version used to wrap this user's field DEK (informational; authoritative copy is `identity_keys`) |
| | consent_id | uuid | FK consents(id) | Latest `granted` consent row (M03) covering this record |
| | completed_at | timestamptz | | First submit time for this record. Never cleared on edit |
| | anchor_completed_at | timestamptz | | Set by `card.completed` event where the card is the retention anchor |
| | delete_after | timestamptz | | See retention formula; NULL only while status `deleted` |
| | draft_expires_at | timestamptz | | `updated_at + draft_ttl_days` while `draft`; NULL once `complete` |
| | deleted_at | timestamptz | | |
| | deleted_reason | `identity_delete_reason` enum | | `retention_anchor` \| `retention_hard_cap` \| `draft_expired` \| `student_request` \| `consent_withdrawn` \| `account_deletion` \| `admin_purge` |
| | created_at / updated_at | timestamptz | NOT NULL default now() | |

Table constraints:

- `CHECK (status <> 'deleted' OR (full_name_enc IS NULL AND father_name_enc IS NULL AND mother_name_enc IS NULL AND current_address_enc IS NULL AND permanent_address_enc IS NULL AND phone_enc IS NULL AND email_enc IS NULL AND passport_number_enc IS NULL AND passport_scan_file_id IS NULL AND signature_file_id IS NULL AND display_mask = '{}'::jsonb))` — a tombstone holds no PII.
- `CHECK (status <> 'complete' OR (all *_enc NOT NULL AND passport_scan_file_id IS NOT NULL AND signature_file_id IS NOT NULL AND completed_at IS NOT NULL AND delete_after IS NOT NULL))`.
- Partial unique index: `UNIQUE (user_id) WHERE status IN ('draft','complete','deleting')` — at most one live record. Any number of tombstones.

**`identity_keys`** — per-user field DEK.

| Table | Column | Type | Constraints | Notes |
|-------|--------|------|-------------|-------|
| identity_keys | record_id | uuid | PK, FK identity_records(id) ON DELETE CASCADE | One DEK per record, so a new record after deletion never reuses a destroyed key |
| | user_id | uuid | NOT NULL | |
| | wrapped_dek | bytea | NOT NULL | Envelope-format wrap (below) |
| | kek_version | smallint | NOT NULL | |
| | created_at | timestamptz | NOT NULL default now() | |
| | rewrapped_at | timestamptz | | |

**`secure_files`** — shared by M05 (`owner_module='identity'`) and M07 (`owner_module='proof'`). Refinement of data-model `identity_files`.

| Table | Column | Type | Constraints | Notes |
|-------|--------|------|-------------|-------|
| secure_files | id | uuid | PK | Used in AAD |
| | owner_module | `secure_file_owner` enum | NOT NULL; `identity` \| `proof` | |
| | owner_user_id | uuid | NOT NULL, FK users(id) | |
| | purpose | text | NOT NULL; CHECK in (`passport_scan`,`signature`,`proof`) | |
| | status | `secure_file_status` enum | NOT NULL; `pending_scan` \| `scanning` \| `clean` \| `rejected` \| `deleted` | |
| | reject_code | text | | `INFECTED`, `BAD_MAGIC`, `MIME_MISMATCH`, `TOO_LARGE`, `DECODE_FAILED`, `PDF_ACTIVE_CONTENT`, `CONVERT_FAILED`, `TOO_SMALL`, `SIGNATURE_EMPTY` |
| | declared_mime | text | NOT NULL | From the client, informational |
| | detected_mime | text | NOT NULL | From magic bytes |
| | final_mime | text | | `image/jpeg` \| `image/png` \| `application/pdf` after finalise |
| | size_bytes | integer | NOT NULL | Plaintext size at upload; updated to final size |
| | content_sha256 | bytea | NULL | SHA-256 of the final plaintext. Set by the pipeline **only when `purpose = 'proof'`** (duplicate-evidence detection in M07); always NULL for identity files so no hash of a passport scan exists. Indexed `WHERE content_sha256 IS NOT NULL` |
| | quarantine_key | text | | `quarantine/{owner_user_id}/{id}` |
| | final_key | text | | `final/{owner_module}/{owner_user_id}/{id}` |
| | q_wrapped_dek | bytea | | DEK for quarantine blob |
| | wrapped_dek | bytea | | DEK for final blob; NULL until clean; NULL after deletion (crypto-shred) |
| | kek_version | smallint | | Version used for `wrapped_dek` |
| | scan_attempts | smallint | NOT NULL default 0 | |
| | av_db_version | text | | clamd signature DB version at scan |
| | scanned_at / finalised_at / deleted_at | timestamptz | | |
| | created_at | timestamptz | NOT NULL default now() | |

**`identity_access_log`** — student-visible access history (separate from the hash-chained `audit_log`, which also receives each event).

| Table | Column | Type | Constraints | Notes |
|-------|--------|------|-------------|-------|
| identity_access_log | id | uuid | PK | |
| | subject_user_id | uuid | NOT NULL | Whose data |
| | actor_user_id | uuid | NOT NULL | |
| | actor_kind | text | CHECK in (`student`,`admin`,`system`) | |
| | action | text | CHECK in (`reveal_fields`,`view_file`,`self_reveal_fields`,`self_view_file`,`export_built`,`export_downloaded`,`purge`) | |
| | fields | text[] | | Field names only |
| | file_id | uuid | | |
| | reason_code | text | | Required for admin actions |
| | reason_note | varchar(300) | | Free text, UI warns "do not enter personal data" |
| | request_id | uuid | NOT NULL | |
| | created_at | timestamptz | NOT NULL default now() | Append-only: no UPDATE/DELETE grant to `nivo_app` |

**`deletion_requests`** — shared with M02 (account scope). M05 owns rows where `scope = 'identity'`.

| Table | Column | Type | Constraints | Notes |
|-------|--------|------|-------------|-------|
| deletion_requests | id | uuid | PK | |
| | user_id | uuid | NOT NULL | |
| | scope | text | CHECK in (`identity`,`account`) | |
| | kind | text | CHECK in (`deletion`,`consent_withdrawal`) | |
| | status | text | CHECK in (`requested`,`processing`,`completed`,`failed`,`cancelled`) | |
| | requested_at | timestamptz | NOT NULL default now() | |
| | due_at | timestamptz | NOT NULL | `requested_at + 30 days` (Art. 12(3)); alert at 7 days before |
| | completed_at | timestamptz | | |
| | failure_code | text | | |
| | step_state | jsonb | NOT NULL default `'{}'` | Saga flags: `objectsDeleted`, `rowsPurged`, `ledgerWritten`, `emailQueued` |
| | request_id | uuid | | |

**`identity_exports`**

| Table | Column | Type | Constraints | Notes |
|-------|--------|------|-------------|-------|
| identity_exports | id | uuid | PK | |
| | user_id | uuid | NOT NULL | |
| | status | text | CHECK in (`requested`,`building`,`ready`,`expired`,`failed`) | |
| | requested_at / ready_at / expires_at | timestamptz | | `expires_at = ready_at + 7 days` |
| | object_key | text | | `exports/{user_id}/{id}.zip.enc` |
| | wrapped_dek | bytea | | |
| | size_bytes | integer | | |
| | download_count | smallint | NOT NULL default 0 | Max 3 |

**`deletion_ledger`** — PII-free proof of erasure and restore-replay source.

| Table | Column | Type | Constraints | Notes |
|-------|--------|------|-------------|-------|
| deletion_ledger | id | uuid | PK | |
| | user_id | uuid | NOT NULL | |
| | record_id | uuid | NOT NULL | |
| | reason | `identity_delete_reason` | NOT NULL | |
| | objects_deleted | smallint | NOT NULL | |
| | executed_at | timestamptz | NOT NULL | |
| | offsite_written_at | timestamptz | | Set after the line is appended to the off-DB ledger object |

Off-DB ledger: each row is also appended as one JSON line to `ledger/identity-deletions/YYYY-MM.jsonl` in a write-only, versioned bucket (M01). Restore runbook replays it (see §6, `identity.ledger.replay`).

### Cryptographic format

- **Master KEK:** 32 random bytes in a mounted secret file (`/run/secrets/nivo_kek_v{N}`), loaded at boot; several versions can be loaded. A deployment salt secret feeds HKDF.
- **Purpose key:** `HKDF-SHA256(master_v, salt, info = "nivo/v1/" + purpose, L = 32)` for purposes `identity-fields`, `identity-files`, `proofs`, `exports`.
- **Envelope (used for fields, DEK wraps and file blobs):**
  `0x01 | kek_version (1 byte) | iv (12 bytes, CSPRNG) | ciphertext | tag (16 bytes)`; AES-256-GCM; no truncated tags.
- **Field DEK:** 32 random bytes per record, wrapped with the `identity-fields` purpose key. AAD for the wrap: `"dek|" + user_id + "|" + record_id`.
- **Field AAD:** `user_id | record_id | field_name | "v1"`. Decryption with the wrong row or column fails authentication.
- **File DEK:** 32 random bytes per file per stage, wrapped with the `identity-files` (or `proofs`) purpose key. File AAD: `file_id | owner_user_id | purpose | stage ("q" or "f") | "v1"`.
- **Rewrap:** job reads `wrapped_dek`, unwraps with its recorded `kek_version`, wraps with the current version, updates the row. Data blobs are untouched. Old KEK version is retired only when no row references it.
- **Boot self-test:** decrypts a canary ciphertext shipped with the release; failure aborts startup.
- **Plaintext handling:** decrypted buffers are zero-filled after use (`Buffer.fill(0)`); no plaintext in caches, queues, or temp disk except worker tmpfs during scan (wiped in `finally`).

### Indexes

| Index | Definition | Purpose |
|-------|-----------|---------|
| `identity_records_live_user` | UNIQUE (user_id) WHERE status IN ('draft','complete','deleting') | One live record |
| `identity_records_due` | (delete_after) WHERE status IN ('draft','complete') | Retention sweep |
| `identity_records_draft_due` | (draft_expires_at) WHERE status = 'draft' | Draft expiry |
| `identity_records_user` | (user_id, created_at DESC) | Latest record lookup |
| `secure_files_owner` | (owner_user_id, owner_module, purpose, status) | Per-user lookups |
| `secure_files_pending` | (created_at) WHERE status IN ('pending_scan','scanning') | Scan backlog and stale alert |
| `secure_files_quarantine_old` | (created_at) WHERE quarantine_key IS NOT NULL | Orphan cleanup |
| `identity_access_log_subject` | (subject_user_id, created_at DESC) | Student history, admin view |
| `identity_access_log_actor` | (actor_user_id, created_at DESC) | Reveal rate limit and alerting |
| `deletion_requests_due` | (due_at) WHERE status IN ('requested','processing','failed') | SLA monitor |
| `identity_exports_expiry` | (expires_at) WHERE status = 'ready' | Export expiry |

### RLS policies

All identity tables: `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`. The API sets `SET LOCAL app.user_id`, `app.role` (`student` \| `admin` \| `worker`) and `app.perms` (comma list) per transaction from the verified session.

| Table | Policy | Rule |
|-------|--------|------|
| identity_records | `student_self` | `FOR ALL USING (user_id = current_setting('app.user_id')::uuid AND current_setting('app.role') = 'student')` |
| identity_records | `admin_masked_read` | `FOR SELECT USING (current_setting('app.role') = 'admin' AND 'identity.view_masked' = ANY(string_to_array(current_setting('app.perms'), ',')))` |
| identity_records | `worker_all` | `FOR ALL USING (current_setting('app.role') = 'worker')` — retention/scan/export jobs |
| identity_keys, secure_files | same three patterns; admin policy additionally requires `identity.reveal` or `partners.proof.review` (for `owner_module = 'proof'`) | |
| identity_access_log | `student_read_own` | `FOR SELECT USING (subject_user_id = current_setting('app.user_id')::uuid)`; insert allowed to any app role; no UPDATE/DELETE policy |
| deletion_requests, identity_exports | student self; admin read with `identity.export`; worker all | |

Additional isolation:

- View `identity_records_masked` (columns: `id`, `user_id`, `status`, `display_mask`, `completed_at`, `delete_after`, `deleted_at`, `deleted_reason`) is the only relation used by admin list/search queries; ciphertext columns are not selectable through it.
- The DB role used by M10 reporting has **no grant** on any `identity_*` table or `secure_files`.
- `nivo_app` has no `DELETE` on `identity_access_log` and no `UPDATE` on `deletion_ledger` except `offsite_written_at`.

## 2. API endpoints

Common: all student endpoints require a verified session, CSRF token on non-GET, and a paid entitlement (`402 PAYMENT_REQUIRED`, or `202 PAYMENT_PROCESSING` if M04 reports processing), except `GET /api/identity/status` which also returns for unpaid users `{state:"none", paymentRequired:true}` so the stepper can render. Responses with personal data carry `Cache-Control: no-store`. Admin endpoints additionally require the permission shown and, where marked, step-up (`STEP_UP_REQUIRED`, valid ≤ 10 min).

### Student

| Method | Path | Permission | Request | Response | Errors | Rate limit | Idempotency |
|--------|------|------------|---------|----------|--------|------------|-------------|
| GET | `/api/identity/status` | student session | — | `IdentityStatus` | 401 | 60/min/user | n/a |
| POST | `/api/identity/consent` | student, paid | `ConsentInput` | 201 `{recordId, consentId}`; 200 if already granted for the current text version | 400 `VALIDATION_FAILED`, 402, 409 `CONFLICT` (record `deleting`) | 10/h/user | Natural (unique per record + version) |
| GET | `/api/identity/record` | student, paid | — | `IdentityMaskedView` | 402, 404 (no record) | 60/min/user | n/a |
| PATCH | `/api/identity/record` | student, paid | `IdentityPatch` | `IdentityMaskedView` | 400, 402, 403 `FORBIDDEN` (no granted consent), 409 (record `deleting`/`deleted`) | 60/h/user | `Idempotency-Key` optional; PATCH is naturally idempotent |
| POST | `/api/identity/files` | student, paid | multipart: `kind` (`passport_scan`\|`signature`), `file` | 202 `FileStatus` (`pending_scan`) | 400 `UPLOAD_REJECTED`, 402, 403, 409 (a scan is already pending for this kind), 413 mapped to `UPLOAD_REJECTED` | 10/10 min/user, 30/h/IP | `Idempotency-Key` header, 24 h |
| GET | `/api/identity/files/:fileId` | student, owner | — | `FileStatus` | 404 (also for other users' ids) | 120/min/user | n/a |
| DELETE | `/api/identity/files/:fileId` | student, owner | — | 204 | 404, 409 (file is the only clean file of a `complete` record — replace instead) | 20/h/user | Natural |
| POST | `/api/identity/submit` | student, paid | `SubmitInput` | 200 `IdentityStatus` (state `complete`) | 400 `VALIDATION_FAILED` with `details[]` listing missing items, 409 (files not `clean` — details `FILES_PENDING`), 403 (no consent) | 10/h/user | Re-submit of a `complete` record returns 200 without side effects |
| POST | `/api/identity/reveal` | student, paid, **step-up** | `{fields: FieldName[]}` (max 9) | `{values: Partial<IdentityPlain>}` | 401 `STEP_UP_REQUIRED`, 404 | 10/h/user | n/a (not idempotent by design; every call logged) |
| GET | `/api/identity/files/:fileId/content` | student, owner, **step-up** | — | Binary stream, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store` | 401, 404, 409 (not `clean`) | 10/h/user | n/a |
| GET | `/api/identity/access-log` | student | `?cursor&limit≤50` | `{items: AccessLogItem[], nextCursor}` | 401 | 30/min/user | n/a |
| POST | `/api/identity/exports` | student, **step-up** | — | 202 `{exportId}` | 409 `CONFLICT` (one in progress), 429 (1 per 24 h) | 1/24 h/user | `Idempotency-Key` |
| GET | `/api/identity/exports/:exportId` | student, owner | — | `{status, expiresAt?}` | 404 | 60/min/user | n/a |
| GET | `/api/identity/exports/:exportId/download` | student, owner, **step-up** | — | Binary zip stream | 404, 409 (not ready / expired / download limit) | 5/h/user | n/a |
| POST | `/api/identity/deletion-requests` | student, **step-up** | `DeletionInput` | 202 `{requestId, dueAt}` | 409 (already pending), 404 (no live record) | 5/day/user | `Idempotency-Key` |
| GET | `/api/identity/deletion-requests` | student | — | list | 401 | 30/min | n/a |

### Admin

| Method | Path | Permission | Request | Response | Errors | Rate limit | Idempotency |
|--------|------|------------|---------|----------|--------|------------|-------------|
| GET | `/api/admin/identity/:userId` | `identity.view_masked` | — | `AdminIdentityMaskedView` (masks, file metadata, `deleteAfter`, `anchorCompletedAt`, state) | 403, 404 | 120/min/admin | n/a |
| POST | `/api/admin/identity/:userId/reveal` | `identity.reveal`, **step-up** | `AdminRevealInput` | `{values, revealedAt, auditId}` | 400 (reason missing/short), 401, 403, 404, 429, 500 if audit write fails (no data returned) | 20/h/admin, alert at >10 distinct users/h | Not idempotent; each call audited |
| POST | `/api/admin/identity/:userId/files/:fileId/reveal` | `identity.reveal`, **step-up** | `{reason: ReasonInput}` | Binary stream (`attachment` disposition for scans; inline for signature) | 400, 401, 403, 404, 409, 429 | 20/h/admin (shared counter) | Not idempotent |
| GET | `/api/admin/identity/:userId/access-log` | `identity.view_masked` | `?cursor&limit` | `AccessLogItem[]` | 403 | 60/min/admin | n/a |
| GET | `/api/admin/dsr` | `identity.export` | `?status&dueBefore` | list | 403 | 60/min/admin | n/a |
| POST | `/api/admin/dsr/:requestId/retry` | `identity.export` | — | 202 | 403, 404, 409 | 20/h/admin | Natural |
| POST | `/api/admin/identity/:userId/purge` | `identity.purge`, **step-up**, approval policy `identity.purge` | `{reason: ReasonInput}` | 202 `{purgeJobId}`; 409 `APPROVAL_REQUIRED` while pending approval | 400, 403, 404, 409 | 10/h/admin | `Idempotency-Key` |
| GET | `/api/admin/identity/retention/overdue` | `identity.view_masked` | — | `{count, oldestDueAt}` | 403 | 30/min | n/a |

### Zod schemas

```ts
// packages/shared/src/identity.ts
import { z } from "zod";

const nfc = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();

export const PersonName = z
  .string()
  .transform(nfc)
  .pipe(
    z.string()
      .min(1).max(100)
      .regex(/^[\p{L}\p{M}][\p{L}\p{M}' .\-]*$/u, "Letters, spaces, hyphen, apostrophe and full stop only"),
  );

export const CountryCode = z.string().length(2).regex(/^[A-Z]{2}$/); // validated against ISO 3166-1 alpha-2 list server-side

export const Address = z.object({
  line1: z.string().transform(nfc).pipe(z.string().min(1).max(120)),
  line2: z.string().transform(nfc).pipe(z.string().max(120)).optional(),
  city: z.string().transform(nfc).pipe(z.string().min(1).max(80)),
  region: z.string().transform(nfc).pipe(z.string().max(80)).optional(),
  postalCode: z.string().transform(nfc).pipe(z.string().min(1).max(12).regex(/^[A-Za-z0-9][A-Za-z0-9 \-]*$/)),
  country: CountryCode,
}).strict();

export const PassportNumber = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, "").toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{6,12}$/));

export const PhoneE164 = z.string().regex(/^\+[1-9]\d{6,14}$/); // plus libphonenumber isValid() server-side

export const ContactEmail = z.string().transform((s) => s.trim().toLowerCase()).pipe(z.string().email().max(254));

export const FieldName = z.enum([
  "fullName", "fatherName", "motherName", "currentAddress", "permanentAddress",
  "phone", "email", "passportNumber",
]);

export const IdentityFields = z.object({
  fullName: PersonName,
  fatherName: PersonName,
  motherName: PersonName,
  currentAddress: Address,
  permanentSameAsCurrent: z.boolean(),
  permanentAddress: Address,
  phone: PhoneE164,
  email: ContactEmail,
  passportNumber: PassportNumber,
}).strict();

// Draft save / edit: any subset. Omitted key = unchanged. null is NOT allowed (no clearing of required fields).
export const IdentityPatch = IdentityFields.partial().strict().refine((v) => Object.keys(v).length > 0, "Empty patch");

export const ConsentInput = z.object({
  consentTextVersionId: z.string().uuid(),   // M03 legal_documents version for purpose identity_vault
  accepted: z.literal(true),                 // checkbox is unticked by default in the UI
}).strict();

export const SubmitInput = z.object({
  consentTextVersionId: z.string().uuid(),   // must equal the currently active version
}).strict();

export const ReasonCode = z.enum([
  "SUPPORT_TICKET", "PARTNER_ONBOARDING_ASSIST", "FRAUD_CHECK", "LEGAL_REQUEST", "DATA_QUALITY_FIX", "OTHER",
]);

export const ReasonInput = z.object({
  code: ReasonCode,
  note: z.string().transform((s) => s.trim()).pipe(z.string().min(10).max(300)), // required for every code
  ticketRef: z.string().max(40).optional(),
}).strict();

export const AdminRevealInput = z.object({
  fields: z.array(FieldName).min(1).max(8).refine((a) => new Set(a).size === a.length),
  reason: ReasonInput,
}).strict();

export const DeletionInput = z.object({
  kind: z.enum(["deletion", "consent_withdrawal"]),
  confirm: z.literal(true),
}).strict();

export const FileKind = z.enum(["passport_scan", "signature"]);

export const FileStatus = z.object({
  fileId: z.string().uuid(),
  kind: FileKind,
  status: z.enum(["pending_scan", "scanning", "clean", "rejected"]),
  rejectCode: z.string().nullable(),
  finalMime: z.string().nullable(),
  uploadedAt: z.string().datetime(),
});

export const IdentityStatus = z.object({
  state: z.enum(["none", "draft", "complete", "deleted"]),
  paymentRequired: z.boolean(),
  identityEverCompleted: z.boolean(),
  consent: z.object({ activeTextVersionId: z.string().uuid(), grantedForActive: z.boolean() }),
  missing: z.array(z.enum(["fullName","fatherName","motherName","currentAddress","permanentAddress","phone","email","passportNumber","signature","passportScan","consent"])),
  files: z.array(FileStatus),
  deleteAfter: z.string().datetime().nullable(),
});
```

Masked view shape:

```ts
export const IdentityMaskedView = z.object({
  fullName: z.string(), fatherName: z.string(), motherName: z.string(),
  currentAddress: z.string(), permanentAddress: z.string(), permanentSameAsCurrent: z.boolean(),
  phone: z.string(), email: z.string(), passportNumber: z.string(),
  signature: z.object({ onFile: z.boolean(), uploadedAt: z.string().datetime().nullable() }),
  passportScan: z.object({ onFile: z.boolean(), uploadedAt: z.string().datetime().nullable(), type: z.enum(["image","pdf"]).nullable() }),
  state: z.enum(["draft","complete"]),
  deleteAfter: z.string().datetime().nullable(),
});
```

### Masking rules (`display_mask`, computed at write time)

| Field | Rule | Example |
|-------|------|---------|
| fullName / fatherName / motherName | First letter of each token + `•••` | `R••• K•••` |
| passportNumber | `••••` + last 3 chars (length ≥ 6 guaranteed) | `••••4X7` |
| phone | `+` + country calling code (libphonenumber) + ` ••••••` + last 2 digits | `+49 ••••••21` |
| email | first char + `•••@` + first char of domain + `•••.` + TLD | `r•••@g•••.com` |
| current/permanent address | `••••••, ` + city + `, ` + country code | `••••••, Berlin, DE` |
| signature / passportScan | Presence flag + upload date only. No thumbnail, no image in any default response | `Signature on file (12 Nov 2026)` |

Mask strings are recomputed on every successful write of the field. A mask never contains more than 3 characters of any original value.

## 3. State machines

### Identity record

```
          POST /consent                 POST /submit
 (none) ───────────────► draft ───────────────────────► complete
                           │  │                            │  │
     draft_expires_at ─────┘  └── deletion/withdrawal ─────┤  │
     (30 d idle)                                           │  │
                           ▼                               ▼  ▼
                        deleting ◄──────── retention / request / admin purge
                           │
                           ▼
                        deleted (tombstone, terminal)
```

| From | To | Trigger | Guard | Side effects (same transaction unless noted) |
|------|----|---------|-------|----------------------------------------------|
| none | draft | `POST /consent` | paid, no live record | consent row (M03), key row, `draft_expires_at` set, audit |
| draft | draft | `PATCH`, file upload | consent granted, not deleting | masks updated, `draft_expires_at` pushed out |
| draft | complete | `POST /submit` | all fields present, both files `clean`, consent granted for active version | `completed_at` set (first time), `delete_after` computed, `draft_expires_at = NULL`, event `identity.completed`, audit |
| complete | complete | `PATCH`, file replacement | valid values | masks updated; `delete_after` unchanged; audit lists changed field names |
| draft/complete | deleting | sweep, deletion request, withdrawal, account deletion, admin purge | row lock acquired | `deletion_requests` → `processing` (if any) |
| deleting | deleted | purge saga completes | objects verified gone | DEK destroyed, ciphertext nulled, tombstone, ledger, event `identity.deleted`, email, audit |
| deleted | — | terminal | | A later `POST /consent` creates a **new** record with a new id and DEK |

**Retention formula** (settings in §9; code constant `HARD_CAP_DAYS_MAX = 90` cannot be exceeded by settings):

```
cap     = completed_at + hard_cap_days
anchor  = anchor_completed_at + after_anchor_days        (only if anchor_completed_at is set)
floor   = completed_at + floor_days
delete_after = max( least(cap, coalesce(anchor, cap)), floor )
```

Recomputed on: submit (sets cap), `card.completed` for the anchor card (sets `anchor_completed_at`), and when retention settings are published (batch job). `delete_after` is never moved later than `cap`.

### Secure file

```
pending_scan ──► scanning ──► clean ──► deleted
     │              │
     └──────────────┴──► rejected ──► deleted (object removed immediately)
```

| From | To | Trigger | Notes |
|------|----|---------|-------|
| (new) | pending_scan | Upload accepted (size, magic bytes OK, quarantine blob written) | Sync stage |
| pending_scan | scanning | Worker picks job | `scan_attempts++` |
| scanning | pending_scan | clamd unreachable / timeout | Backoff retry; **never** `clean` |
| scanning | rejected | Infected, decode failure, convert failure, PDF active content, too small | Quarantine object deleted; `reject_code` set |
| scanning | clean | All finalise steps succeeded | Final blob written with new DEK; quarantine deleted; `finalised_at` set |
| clean | deleted | Replacement uploaded and became `clean`, record purge, or DELETE on draft | Object removed, `wrapped_dek` nulled |

A record may reference only `clean` files at submit. A replacement upload for a `complete` record keeps the old file referenced until the new one is `clean`, then swaps the FK and deletes the old file in one transaction.

### Deletion request

`requested → processing → completed`; `processing → failed → processing` (retry); `requested → cancelled` (student cancels before the worker starts, via support). Failure alerts after 3 attempts; SLA breach alert at `due_at - 7 days`.

## 4. Sequence diagrams

### Happy path — submit and unlock

```mermaid
sequenceDiagram
    participant S as Student SPA
    participant A as API (M05)
    participant P as M04 Entitlement
    participant C as M03 Consents
    participant DB as PostgreSQL
    participant M6 as M06 Card engine
    S->>A: POST /api/identity/consent {versionId, accepted:true}
    A->>P: isPaid(userId)
    P-->>A: true
    A->>C: record granted (purpose identity_vault)
    A->>DB: insert identity_records(draft), identity_keys
    A-->>S: 201
    S->>A: PATCH /record {fields}
    A->>DB: encrypt fields (AES-256-GCM) + display_mask
    S->>A: POST /files (passport scan, signature)
    A-->>S: 202 pending_scan (scan job queued)
    Note over A,DB: worker scans, finalises, status becomes clean
    S->>A: POST /submit {versionId}
    A->>DB: BEGIN; SELECT record FOR UPDATE
    A->>A: completeness + files clean + consent active
    A->>DB: status=complete, completed_at, delete_after
    A->>M6: publish identity.completed (in-process, same TX)
    M6->>DB: card_progress locked→available for cards 1 and 3
    A->>DB: audit_log; COMMIT
    A-->>S: 200 IdentityStatus(complete)
```

### Happy path — file pipeline

```mermaid
sequenceDiagram
    participant S as SPA
    participant A as API
    participant O as Object store
    participant J as Queue
    participant W as Worker sandbox
    participant AV as ClamAV
    S->>A: POST /files (multipart, ≤ 8 MiB)
    A->>A: stream with byte cap; sniff magic bytes; compare with declared type
    A->>A: new file DEK; encrypt (stage q)
    A->>O: PUT quarantine/{user}/{file}
    A->>DB: secure_files(pending_scan)
    A->>J: enqueue identity.file.scan {fileId}
    A-->>S: 202
    J->>W: run scan
    W->>O: GET quarantine blob; decrypt into tmpfs
    W->>AV: INSTREAM
    AV-->>W: OK
    W->>W: HEIC→JPEG, apply orientation, re-encode, strip EXIF/ICC/XMP (images); qpdf check + strip (PDF)
    W->>W: re-sniff magic bytes of output; check min size and (signature) ink pixels
    W->>W: new file DEK; encrypt (stage f)
    W->>O: PUT final/identity/{user}/{file}; DELETE quarantine blob
    W->>DB: status=clean, final_mime, wrapped_dek, finalised_at
    S->>A: GET /files/{id} (poll every 2 s, max 60 s)
    A-->>S: clean
```

### Happy path — admin reveal

```mermaid
sequenceDiagram
    participant AD as Admin UI
    participant A as API
    participant M9 as M09 (perm, audit)
    participant DB as PostgreSQL
    AD->>A: POST /admin/identity/{u}/reveal {fields, reason}
    A->>M9: permission identity.reveal? step-up fresh?
    A->>A: rate limit 20/h/admin
    A->>DB: BEGIN; insert audit_log + identity_access_log (reason, fields, requestId)
    Note over A,DB: if either insert fails → ROLLBACK → 500, nothing decrypted
    A->>DB: read ciphertext; unwrap DEK; decrypt requested fields only
    A->>DB: COMMIT
    A-->>AD: 200 {values} (Cache-Control: no-store)
    AD->>AD: auto-hide values after 60 s
```

### Happy path — retention purge

```mermaid
sequenceDiagram
    participant J as Sweep job (hourly)
    participant Q as Queue
    participant W as Purge worker
    participant O as Object store
    participant DB as PostgreSQL
    participant L as Off-DB ledger
    J->>DB: SELECT records WHERE delete_after <= now() LIMIT 200
    J->>Q: enqueue identity.purge {recordId, reason} (dedupe key)
    Q->>W: run
    W->>DB: BEGIN; lock record; status=deleting; COMMIT
    W->>O: DELETE quarantine/final blobs; HEAD must return 404
    W->>DB: BEGIN; delete identity_keys; null ciphertext, masks, wrapped DEKs; status=deleted; insert deletion_ledger
    W->>DB: outbox: identity.deleted, email, audit_log; COMMIT
    W->>L: append JSON line; set offsite_written_at
```

### Failure paths

| Case | Behaviour |
|------|-----------|
| Unpaid or payment still processing | Every identity endpoint except `GET /status` returns 402 / 202; no row is created |
| No consent row | `PATCH`, uploads and submit return 403 `FORBIDDEN` (`details: CONSENT_REQUIRED`) |
| Declared MIME or extension disagrees with magic bytes | 400 `UPLOAD_REJECTED`, nothing stored |
| File > 8 MiB | Stream aborted at the cap, 400 `UPLOAD_REJECTED` |
| ClamAV unreachable | File stays `pending_scan`; retries with exponential backoff up to 12 attempts over ~6 h; alert at 15 min; student sees "We are checking your file"; submit returns 409 `FILES_PENDING` |
| Infected | `rejected` / `INFECTED`; blob deleted; counted in metrics; student sees `UPLOAD_REJECTED` text; no detail about the signature name |
| HEIC conversion fails | `rejected` / `CONVERT_FAILED`; UI suggests exporting as JPEG; 3 failures → 10 min upload cooldown |
| Object store write fails during upload | No DB row written; 500 `INTERNAL` with requestId; client retries with the same `Idempotency-Key` |
| Admin reveal: audit or access-log insert fails | Transaction aborts, 500 `INTERNAL`; **no plaintext in the response** |
| Admin reveal without step-up | 401 `STEP_UP_REQUIRED` |
| Admin reveal over rate limit | 429 `RATE_LIMITED`; alert row to M09 |
| Wrong AAD (ciphertext swapped) | GCM auth fails, 500 `INTERNAL`, security alert `identity.decrypt_auth_failure` |
| Event handler (M06) throws on submit | Whole submit transaction rolls back; record stays `draft`; student retries |
| Purge: object delete fails | Saga step retried (exponential, up to 10); `deletion_requests.status = failed` after exhaustion and Super Admin alert; DB rows are only purged after objects are verified gone |
| Purge: crash between steps | Re-run is idempotent: each step checks `step_state` and current row state |
| Concurrent submit and purge | Both take `FOR UPDATE` on the record; purge wins if `deleting` already set → submit returns 409 |
| Backup restore | Runbook runs `identity.ledger.replay` before the API accepts traffic |

## 5. Validation rules

| Field | Client | API | DB |
|-------|--------|-----|----|
| fullName | Required, 1–100, letters/marks/space/`'`/`.`/`-`, helper text "exactly as printed on your passport" | `PersonName` (NFC, collapse spaces) | `bytea` ciphertext; mask computed |
| fatherName / motherName | Same as fullName | `PersonName` | `bytea` |
| currentAddress | Line 1, city, postal code, country required; line 2 and region optional; country select (ISO list) | `Address` strict (unknown keys rejected); country in ISO 3166-1 alpha-2 list | `bytea` (canonical JSON) |
| permanentAddress | "Same as current" checkbox copies values; otherwise same as above | `Address`; if `permanentSameAsCurrent` is true the server verifies equality with `currentAddress` and rejects mismatch | `bytea`, `permanent_same_as_current` boolean |
| phone | International input with country picker, E.164 | `PhoneE164` + libphonenumber `isValid` | `bytea` |
| email | Standard email input, prefilled from account (editable) | `ContactEmail` | `bytea` |
| passportNumber | Auto uppercase, strip spaces/hyphens, 6–12 alphanumerics | `PassportNumber` | `bytea` |
| signature | Canvas 600×200 CSS px at devicePixelRatio ≤ 2, "Clear" and "Undo", must contain ink before "Save" is enabled; exports PNG via `toBlob` | multipart `kind=signature`; magic bytes must be PNG; ≤ 300 KB; dimensions 200×60 … 1200×400 (+ decoded with `limitInputPixels`); ink ratio (non-transparent, non-white pixels / total) ≥ 0.002 else `SIGNATURE_EMPTY`; re-encoded 8-bit RGBA PNG | `secure_files` row, `purpose='signature'` |
| passportScan | Accept `.jpg,.jpeg,.png,.pdf,.heic,.heif`; preview of selected file stays local; client may downscale images > 4000 px | ≤ 8 MiB (8 388 608 bytes) streamed cap; declared MIME and extension category must equal sniffed type; images ≤ 50 MP and short side ≥ 400 px; PDF ≤ 5 pages, not encrypted, no active content; exactly one active scan per record | `secure_files` row, `purpose='passport_scan'` |
| consent | Checkbox unticked by default, text from M03 for the active version, link to privacy policy | `accepted: true` literal and `consentTextVersionId` equals the active version | M03 `consents` row |
| reason (admin) | Select code + free text ≥ 10 chars, warning "Do not paste personal data" | `ReasonInput`; text trimmed, length 10–300 | `identity_access_log.reason_*` |
| submit | Button enabled only when `missing` is empty | Server recomputes completeness; never trusts the client | `CHECK` constraint on `status = 'complete'` |

**Magic-byte detector (authoritative, API and worker):**

| Type | Signature | Allowed extension / MIME |
|------|-----------|--------------------------|
| JPEG | `FF D8 FF` at offset 0 | `.jpg` `.jpeg` / `image/jpeg` |
| PNG | `89 50 4E 47 0D 0A 1A 0A` at offset 0 | `.png` / `image/png` |
| PDF | `25 50 44 46 2D` (`%PDF-`) at offset 0 | `.pdf` / `application/pdf` |
| HEIC/HEIF | bytes 4–7 = `ftyp` and major brand in `heic`, `heix`, `hevc`, `hevx`, `mif1`, `msf1` | `.heic` `.heif` / `image/heic`, `image/heif` |

Anything else → `BAD_MAGIC`. For `kind=signature` only PNG is accepted.

**PDF active-content check:** `qpdf --check` must pass; `qpdf --show-encryption` must report not encrypted; the object stream is scanned for names `/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile`, `/OpenAction`, `/AA`, `/RichMedia`, `/XFA`; any hit → `PDF_ACTIVE_CONTENT`. Metadata removed with `exiftool -all=` followed by `qpdf --linearize`.

## 6. Background jobs

All payloads contain opaque UUIDs only. No names, addresses, passport numbers, emails or free text. Queue: `pg-boss`-style Postgres queue from M01 (queue names below).

| Job | Trigger | Retry | Dead letter | Payload rules |
|-----|---------|-------|-------------|---------------|
| `identity.file.scan` | Upload accepted; also re-enqueued by `identity.file.rescan-stuck` | Exponential 30 s → 30 min, max 12 attempts; infected/decode failures are terminal (not retried) | `identity.file.scan.dead` → alert; file stays `pending_scan`, never `clean` | `{fileId}` — No PII |
| `identity.file.rescan-stuck` | Every 10 min | n/a | n/a | `{}`; finds `pending_scan` older than 15 min, alerts, re-enqueues |
| `identity.retention.sweep` | Hourly at :05 | 3 attempts, 5 min backoff | `identity.retention.dead` → page Super Admin | `{}`; selects due records, enqueues purge with dedupe key `purge:{recordId}` |
| `identity.purge` | From sweep, deletion request, withdrawal, account-deletion saga, admin purge | Exponential up to 10 attempts; steps idempotent | `identity.purge.dead` → page; `deletion_requests.failed` | `{recordId, reason, requestId?}` — No PII |
| `identity.draft.expire` | Daily 03:00 UTC | 3 | alert | `{}`; marks drafts with `draft_expires_at <= now()` for purge (`draft_expired`) |
| `identity.retention.heartbeat` | Every 5 min | none | n/a | `{}`; emits `identity_retention_last_success_ts` and `identity_retention_overdue_count`; alert if last success > 2 h or overdue > 0 for > 1 h (`RISK-ID-RETENTION-SILENT`) |
| `identity.retention.notice` | Daily 08:00 UTC | 3 | alert | `{}`; enqueues email `identity_retention_notice` for records with `delete_after` in 7 days (once per record) |
| `identity.retention.recompute` | After retention settings publish | 3 | alert | `{settingsVersion}`; recalculates `delete_after` for live records, never beyond `completed_at + 90 d` |
| `identity.export.build` | `POST /exports` | 5 | alert | `{exportId}`; decrypts into tmpfs, builds zip, encrypts with `exports` purpose key, queues email |
| `identity.export.expire` | Daily | 3 | alert | `{}`; deletes export objects at `expires_at`, status `expired` |
| `identity.file.orphan-clean` | Daily | 3 | alert | `{}`; deletes quarantine blobs older than 24 h, `clean` files unreferenced for 7 days, rejected-file rows older than 30 days |
| `identity.kek.rewrap` | Manual (admin CLI) after KEK rotation | resumable by cursor | alert | `{fromVersion, toVersion, cursor}` |
| `identity.ledger.replay` | Manual in restore runbook (blocking step) | n/a | n/a | `{sinceTimestamp}`; reads off-DB ledger, purges any record that is live in the restored DB but listed as deleted |
| `identity.consent.reconfirm` | New consent text version published (M03 event) | 3 | alert | `{versionId}`; flags drafts so the UI requires re-confirmation; completed records are not blocked |

## 7. Emails

Emails are queued through M11 outbox (`dedupeKey` prevents duplicates). They never contain identity values, masks, or file names.

| Template key | Trigger | Content summary |
|--------------|---------|-----------------|
| `identity_received` | `identity.completed` | "We received your details. Your cards are now available." Link to dashboard. States retention: deleted 30 days after the blocked-account step is completed, at the latest 90 days after submission |
| `identity_retention_notice` | 7 days before `delete_after` | "Your identity details will be deleted on {date}. Completed steps stay completed." Link to privacy centre to export first |
| `identity_export_ready` | Export built | "Your export is ready, valid 7 days." Link to the download page (requires login + step-up); no attachment |
| `identity_deletion_confirmed` | Purge completed (request, withdrawal, retention, hard cap) | Confirms deletion with date and reason; states that invoices are retained in anonymised form per law and that backups age out within 35 days |
| `identity_deletion_received` | Deletion or withdrawal request accepted | "We received your request; we will complete it within 30 days (usually within an hour)." |

## 8. Audit events

`audit_log` (M09, hash-chained) entries never include plaintext values or ciphertext. "Before/After" lists state transitions or field **names** only.

| Action | Before/After | Reason required |
|--------|--------------|-----------------|
| `identity.consent.granted` | none → consent version id | No |
| `identity.consent.withdrawn` | granted → withdrawn | No |
| `identity.draft.created` | none → draft | No |
| `identity.submitted` | draft → complete | No |
| `identity.field.updated` | field names changed | No |
| `identity.file.uploaded` | none → pending_scan (kind, size) | No |
| `identity.file.rejected` | scanning → rejected (reject_code) | No |
| `identity.file.clean` | scanning → clean | No |
| `identity.reveal.self` | fields list | No (self step-up logged) |
| `identity.reveal.admin` | fields list, subject user id | **Yes** (`ReasonInput`) |
| `identity.file.view.self` | file id | No |
| `identity.file.view.admin` | file id, subject user id | **Yes** |
| `identity.export.requested` / `.ready` / `.downloaded` | status transitions | No |
| `identity.deletion.requested` | requested (kind) | No |
| `identity.purge.completed` | live → deleted (reason enum) | Yes for `admin_purge` (and approval id), no for system reasons |
| `identity.retention.recomputed` | settings version | No (actor = system) |
| `identity.kek.rewrapped` | from/to version, row count | Yes (operator ticket) |
| `identity.decrypt_auth_failure` | record id, field name | No (security alert) |

## 9. Config / admin settings

Edited in M09 with draft → review → publish. Settings marked ✱ need maker-checker approval (`CTRL-ADM-APPROVAL`).

| Key | Default | Bounds | Notes |
|-----|---------|--------|-------|
| `identity.retention.after_anchor_days` ✱ | 30 | 1–60 | Days after anchor card Completed |
| `identity.retention.hard_cap_days` ✱ | 90 | 30–90 (code constant max 90) | From `completed_at` |
| `identity.retention.floor_days` | 7 | 1–14 | Minimum life of a re-submitted record |
| `identity.draft_ttl_days` | 30 | 7–60 | Draft idle expiry |
| `identity.upload.max_bytes` | 8 388 608 | ≤ 10 485 760 | Edge limit must be ≥ value + 1 MB overhead |
| `identity.upload.signature_max_bytes` | 307 200 | ≤ 1 MB | |
| `identity.reveal.rate_per_hour` | 20 | 1–60 | Per admin |
| `identity.reveal.alert_distinct_users_per_hour` | 10 | 3–50 | Alert threshold |
| `identity.stepup.max_age_minutes` | 10 | 1–15 | |
| `identity.export.ttl_days` | 7 | 1–14 | |
| `identity.export.max_downloads` | 3 | 1–5 | |
| `identity.scan.max_attempts` | 12 | 3–24 | |
| `identity.consent.document_key` | `identity-vault-consent` | — | M03 document key for the consent text |
| `identity.reveal.reason_codes` | seed list in `ReasonCode` | — | Adding codes needs a code release (enum in shared package) |

Permissions registered in M09: `identity.view_masked`, `identity.reveal`, `identity.export`, `identity.purge`. None are granted to the Accommodation agent or consultancy roles. Default role mapping: Super Admin has all four; Support has `identity.view_masked` only.

Environment (not settings, never in DB): `NIVO_KEK_FILE_V{N}`, `NIVO_HKDF_SALT_FILE`, `CLAMD_HOST/PORT`, `OBJECT_STORE_*`.

## 10. Logging and redaction

Never logged (enforced by Pino `redact`, route-level `logBody: false`, and CI tests):

- Request or response bodies on `/api/identity/*` and `/api/admin/identity/*`.
- Any of: full name, father/mother name, addresses, phone, email, passport number, signature bytes, scan bytes, base64 blobs, export contents.
- Decrypted buffers, DEKs, wrapped DEKs, KEK material, HKDF salt, canary plaintext.
- Admin `reason.note` text (stored in the access log and audit only; logs carry `reason.code`).
- `Authorization`, `Cookie`, `X-CSRF-Token` headers; multipart filenames (replaced with `<redacted>.{ext}`).
- DB query parameters for statements touching `identity_*` or `secure_files` (query logging at statement level without params; slow-query log scrubbed).
- Job payloads (contain ids only) and exception messages that echo input; the error handler returns the generic catalog message and `requestId`.

Logged: request id, user id (UUID), route, status, duration, file id, file status transitions, reject codes, byte sizes, scan duration, AV signature DB version, purge step names and counts, reveal action with admin id, subject id, field **names**, reason code.

Sentry/telemetry `beforeSend` strips request bodies and breadcrumbs for these routes. A CI check runs the log-redaction test suite and greps test log output for passport-number and e-mail patterns.

## 11. Test cases

Existing IDs keep their meaning from `00-traceability.md` / `00-security-controls.md`: `T-ID-001`, `T-ID-002`, `T-ID-010`, `T-ID-011`, `T-ID-020`, `T-ID-030`, `T-SEC-010`.

| ID | Layer | Description | Expected |
|----|-------|-------------|----------|
| T-ID-001 | integration | Save passport number; read raw DB row; call `GET /record` | Column holds envelope bytes (`0x01` prefix, ≥ 29 bytes), no plaintext substring in table dump; API returns mask `••••4X7` (REQ-ID-01, CTRL-ENC-FIELD-AES) |
| T-ID-002 | integration | Save father/mother name and both addresses | All four columns are ciphertext; masks follow §2 rules; plaintext absent in dump |
| T-ID-003 | unit | `encrypt/decrypt` round trip, 1000 random values incl. Unicode | Equal; IV unique across 100k encryptions (no collisions) |
| T-ID-004 | unit | Decrypt with wrong AAD (other user, other field, other record) | GCM auth error, never plaintext |
| T-ID-005 | unit | Zod: names with digits/emoji/control chars, 101-char name, passport `ab-12 34` normalisation, invalid phone, unknown address key | `VALIDATION_FAILED` with per-field details; normalisation correct |
| T-ID-006 | unit | Mask functions for 1-letter names, short passports, non-Latin names | Never reveals more than 3 chars; no crash |
| T-ID-007 | integration | `permanentSameAsCurrent=true` with differing addresses | 400 |
| T-ID-008 | integration | PATCH with only `phone`; other fields | Others unchanged (ciphertext bytes identical); mask for phone updated |
| T-ID-009 | e2e | Mobile viewport full form | Fields validate inline; keyboard-accessible; "same as current" works |
| T-ID-010 | integration | Upload clean JPEG passport scan; inspect bucket and DB | Object present only under `final/…`; bytes are envelope ciphertext (no JPEG magic); DB has wrapped DEK; bucket anonymous GET → 403 (REQ-ID-02, CTRL-ENC-FILE) |
| T-ID-011 | integration | Draw-signature PNG upload | Stored encrypted; re-encoded PNG; ink check passes; blank canvas rejected `SIGNATURE_EMPTY`; JPEG renamed `.png` rejected `BAD_MAGIC` |
| T-ID-012 | integration | EICAR test file renamed `.pdf` with `%PDF-` prefix | `rejected/INFECTED`; blob deleted; submit blocked |
| T-ID-013 | integration | Upload PNG with `Content-Type: image/jpeg` | 400 `UPLOAD_REJECTED` (MIME mismatch); no row |
| T-ID-014 | integration | Upload JPEG with GPS + camera EXIF and orientation 6 | Final file has no EXIF/GPS/ICC; pixel orientation applied |
| T-ID-015 | integration | Upload HEIC (iPhone sample) | Final `image/jpeg`; legible; HEIC original not retained |
| T-ID-016 | integration | PDF with `/JavaScript`; encrypted PDF; 6-page PDF | `PDF_ACTIVE_CONTENT` / `DECODE_FAILED` / `UPLOAD_REJECTED` respectively |
| T-ID-017 | integration | 8 MiB + 1 byte upload | Aborted at cap, 400 `UPLOAD_REJECTED`, nothing stored |
| T-ID-018 | integration | Stop clamd; upload; submit | File stays `pending_scan`; submit → 409 `FILES_PENDING`; restart clamd → `clean` automatically; never `clean` while AV down (`RISK-ID-AV-DOWN`) |
| T-ID-019 | integration | IDOR: student B requests student A's file id (status, content, delete) | 404 for all |
| T-ID-020 | integration | Fake clock: anchor card Completed at day 5; run sweep at day 34 and 36 | Not deleted at 34; purged at 36 (30 d after anchor). Case 2: no anchor, sweep at day 89 / 91 → purged at 91 (cap). Case 3: anchor Completed at day 80 → cap applies at day 90 (REQ-ID-03) |
| T-ID-021 | integration | Re-submission after anchor already Completed 40 days ago | `delete_after = completed_at + 7 d` (floor), not immediate |
| T-ID-022 | integration | Purge twice, and crash after object delete before row purge | Idempotent; end state identical; ledger has one entry per record |
| T-ID-023 | integration | After purge: dump DB and bucket | No ciphertext, no wrapped DEKs, no objects; tombstone row only; CHECK constraint holds |
| T-ID-024 | integration | Heartbeat metric with sweep disabled for 3 h | Alert fires (`RISK-ID-RETENTION-SILENT`) |
| T-ID-025 | integration | Restore old backup, run `identity.ledger.replay` | Records deleted in ledger are purged again before API serves |
| T-ID-026 | integration | Draft idle 31 days | Drafts purged with reason `draft_expired` |
| T-ID-027 | unit | Retention formula property test over random dates | `delete_after ≤ completed_at + 90 d` unless floor applies; monotone in anchor date |
| T-ID-028 | integration | Settings change `hard_cap_days=120` | Rejected by validation (max 90) |
| T-ID-030 | integration + e2e | Student requests export then deletion | Export zip contains JSON fields, scan, signature, consent history, access log; zip is not downloadable without step-up; deletion completes ≤ 1 h; email sent; export link dead after purge or 7 days (REQ-ID-04, CTRL-DSR) |
| T-ID-031 | integration | Consent withdrawal | Same effect as deletion; consent row `withdrawn` appended; `deleted_reason = consent_withdrawn` |
| T-ID-032 | integration | Export download 4th time; download after expiry | 409 |
| T-ID-033 | integration | Deletion request while another pending | 409 |
| T-ID-034 | integration | Account-deletion saga (M02) calls M05 | Identity purged, `deletion_requests(scope=account)` step recorded |
| T-ID-035 | integration | Invoice rows after identity purge | Untouched (M04 owns anonymisation) |
| T-ID-040 | integration | Admin reveal `passportNumber` with valid reason | Plaintext returned; `identity_access_log` + `audit_log` rows with reason code, fields, admin id; response `no-store` |
| T-ID-041 | integration | Reveal with reason shorter than 10 chars or missing | 400; no audit success row; nothing decrypted |
| T-ID-042 | integration | Make `audit_log` insert fail (revoke grant in test) | 500; response body contains no plaintext; no decrypt call occurred (spy) (`CTRL-ID-REVEAL`) |
| T-ID-043 | integration | Admin without `identity.reveal` (Support role) | 403; masked view works |
| T-ID-044 | integration | 21st reveal in one hour | 429 + alert row; > 10 distinct students in an hour → alert |
| T-ID-045 | integration | Reveal without fresh step-up | 401 `STEP_UP_REQUIRED` |
| T-ID-046 | integration | Accommodation agent and consultancy sessions call identity admin endpoints | 403; DB role for M10 `SELECT identity_records` → permission denied |
| T-ID-047 | integration | Student self reveal | Requires step-up; logged; visible in `/access-log` |
| T-ID-048 | integration | Admin list/search uses `identity_records_masked` | No ciphertext columns in query plan or result |
| T-ID-050 | integration | Unpaid student calls every identity endpoint | 402 (or 202 while processing); no rows created (REQ-ID-05) |
| T-ID-051 | integration | Submit with missing signature / pending scan / no consent | 400/409/403 respectively; record stays draft; cards stay locked |
| T-ID-052 | integration | Successful submit | Same transaction unlocks cards 1 and 3 in M06 (assert `card_progress`); event failure injected → rollback (record `draft`) |
| T-ID-053 | integration | Identity deleted after card 1 Completed, and after card 3 Available | Completed card unchanged; Available card unchanged (latch); no `card_progress` writes by M05 (REQ-ID-10) |
| T-ID-054 | integration | Consent text version bumps before submit | Submit returns 400 until re-confirmed; completed records unaffected |
| T-ID-055 | e2e | Consent checkbox | Unticked by default; form fields not rendered/enabled until ticked |
| T-ID-060 | security | Log redaction suite over all identity routes with sentinel values | Sentinels (`PASSPORT_SENTINEL_9X`, e-mail, name) never appear in logs, Sentry payloads, job payloads |
| T-ID-061 | security | Key rotation: add KEK v2, run `identity.kek.rewrap` | All rows readable; rows reference v2; blobs untouched (hash equal) |
| T-ID-062 | security | Boot with missing/corrupt KEK | Process exits non-zero |
| T-ID-063 | security | Sandbox worker has no outbound network except clamd | Connect to external host fails |
| T-ID-064 | security | Static: no endpoint returns `*_enc` columns; OpenAPI response schemas contain no plaintext identity fields except `reveal` endpoints | CI lint passes |
| T-ID-065 | security | Decompression bomb PNG (50k × 50k) | Rejected `DECODE_FAILED` within 10 s, worker memory capped |
| T-SEC-010 | e2e | Student presses "Delete my identity data" and, separately, account-deletion button | Identity purge request created and completed; UI shows confirmation (REQ-SEC-02) |
