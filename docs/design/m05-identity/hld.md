# HLD: M05 — Identity

| Field | Value |
|-------|-------|
| Module | M05 |
| Status | Review |
| Owner | NIVO platform team (design) |
| Last updated | 2026-11-24 |
| Requirements | REQ-ID-01, REQ-ID-02, REQ-ID-03, REQ-ID-04, REQ-SEC-02 (identity part), REQ-ID-05 … REQ-ID-11 (new, see §2) |

## 1. Purpose and scope

M05 is the **identity vault**. After a student has paid (M04), M05 captures the personal and travel-document details needed to deliver the NIVO service, stores them encrypted, shows them masked, lets only audited admins reveal them, and deletes them on a fixed schedule or on request.

**In scope**

- Identity form after payment: passport-style full name, father's name, mother's name, current address, permanent address, phone, email, passport number.
- Signature drawn on an HTML canvas (PNG) and passport scan upload.
- AES-256-GCM field encryption, envelope-encrypted files, upload hygiene pipeline (size, magic bytes, ClamAV, HEIC conversion, EXIF strip).
- Consent capture (Art. 6(1)(a) GDPR) through M03 consent records.
- Masked display for student and admin; admin reveal with reason, step-up and audit.
- Retention: delete 30 days after the anchor card (card 1, Blocked Account) is Completed; hard cap 90 days after identity completion; draft expiry.
- Data-subject rights: export, deletion, consent withdrawal.
- The shared `SecureFileService` (envelope-encrypted private file storage) that M07 reuses for proof uploads.
- Emitting `identity.completed` and `identity.deleted` events to M06.

**Out of scope**

- Payment (M04), account registration data (M02 `student_profiles`), legal text (M03), card statuses (M06), admin permission registry and approval engine (M09), email sending (M11).
- Sharing identity data with partners or consultancies. Default is **NIVO only, not shared** (`GAP-IDENTITY-PURPOSE`). M10 never reads identity data.
- Identity verification (KYC), document OCR, liveness checks. NIVO stores the data; it does not verify it.
- Account deletion as a whole (M02 saga). M05 only supplies the identity purge step.

## 2. Requirements covered

IDs `REQ-ID-01…04` and `REQ-SEC-02` exist in `00-traceability.md`. IDs `REQ-ID-05…11` are introduced here and must be added to the traceability matrix when this HLD is frozen.

| ID | Statement | Priority |
|----|-----------|----------|
| REQ-ID-01 | After payment, capture identity fields (name as on passport, father/mother name, current + permanent address, phone, email, passport number, signature, passport scan) | Must |
| REQ-ID-02 | Passport scan stored in private storage, envelope-encrypted | Must |
| REQ-ID-03 | Auto-delete: 30 days after card 1 Completed, hard cap 90 days | Must |
| REQ-ID-04 | Student can export and request deletion of identity data | Must |
| REQ-SEC-02 | Deletion request button (identity scope handled here; account scope by M02 saga calling M05) | Must |
| REQ-ID-05 | Identity must be complete before card 1 (and card 3) can open; only paid students may enter identity | Must |
| REQ-ID-06 | Sensitive values are masked in all student and admin views by default | Must |
| REQ-ID-07 | Admin reveal requires permission, step-up, reason, and is audited; fail closed if audit write fails | Must |
| REQ-ID-08 | Explicit, unticked, versioned consent (Art. 6(1)(a)) recorded before the identity form is submitted; withdrawal as easy as giving | Must |
| REQ-ID-09 | Signature captured on canvas and stored as a PNG, encrypted | Must |
| REQ-ID-10 | If identity is deleted later, completed cards stay completed (no card status changes on identity deletion) | Must |
| REQ-ID-11 | Upload hygiene: magic-byte check, ClamAV scan, HEIC→JPEG conversion, EXIF/metadata strip; a file is unusable until scanned clean | Must |

## 3. Component diagram

```
Student browser (SPA: IdentityForm, SignaturePad, ScanUploader, MaskedView, PrivacyCentre)
        │ HTTPS (session cookie + CSRF)
        ▼
apps/api  ── M05 module ───────────────────────────────────────────────┐
  │  IdentityController (student)     AdminIdentityController (admin)  │
  │  IdentityService  (draft/submit/edit/mask/reveal)                  │
  │  CryptoService    (HKDF key hierarchy, AES-256-GCM, DEK wrap)      │
  │  SecureFileService (stage → scan → finalise → stream) ◄── also used by M07
  │  ConsentPort → M03        EntitlementPort → M04 (paid?)            │
  │  AuditPort → M09          EventBus → M06 (identity.*)              │
  │  DsrService (export, delete, withdraw)                             │
  │  RetentionService (delete_after calc, sweep, purge)                │
  └────────────────────────────────────────────────────────────────────┘
        │                     │                       │
        ▼                     ▼                       ▼
  PostgreSQL 16         Object storage           Job queue workers
  identity_records      (private bucket,         identity.file.scan
  identity_files        ciphertext only)         identity.retention.sweep
  identity_keys                                  identity.purge
  identity_access_log                            identity.export
  deletion_requests                              identity.retention.heartbeat
  identity_exports                                    │
        ▲                                             ▼
  Key material (KEK master)                    ClamAV (clamd, internal only)
  from secrets file, never in DB               libheif / sharp / qpdf sandbox
```

| Component | Responsibility |
|-----------|----------------|
| IdentityService | Draft save, submit, partial edit, masked read, student self-reveal (step-up), completeness check |
| CryptoService | Derives purpose keys from the master KEK with HKDF, generates and wraps DEKs, encrypts/decrypts fields and file blobs with AAD binding |
| SecureFileService | Upload staging, magic-byte check, quarantine encryption, scan job, finalise (convert, strip, re-encrypt), streamed decrypt, deletion |
| RetentionService | Computes `delete_after`, runs hourly sweep, purge saga, heartbeat metric for overdue detection |
| DsrService | Export package build, deletion and consent-withdrawal request handling, 30-day SLA tracking |
| AdminIdentityController | Masked view, reveal (fields and files), DSR queue, manual purge |
| Event publisher | Transactional in-process events `identity.completed`, `identity.deleted` consumed by M06 |

## 4. Data flows and trust boundaries

**Flow A — Capture (student → vault)**

1. Student (paid, verified, session valid) opens the identity step. Server checks entitlement from M04; unpaid → `402 PAYMENT_REQUIRED`.
2. Before any field is stored, the student sees the purpose text (M03 versioned) and ticks an unticked consent checkbox. API writes a `granted` consent row and creates the draft record. No consent row → no data is accepted.
3. Student saves draft fields. API validates with Zod, encrypts each field with AES-256-GCM, writes ciphertext. Plaintext exists only in API process memory for the request.
4. Student uploads passport scan and draws the signature. Files go through the staged pipeline (Flow B).
5. Student submits. API verifies completeness (all fields present, signature file `clean`, passport scan `clean`, consent still `granted` for the current consent text version) and in **one transaction** sets the record to `complete`, computes `delete_after`, and emits `identity.completed`. M06 unlocks cards 1 and 3 in that same transaction. If the consent text version changed since step 2, the student re-confirms before submit.

**Flow B — File pipeline**

```
Browser ─► API (size cap streamed, magic bytes vs declared type)
        ─► encrypt with fresh file DEK ─► object store  quarantine/…  [status pending_scan]
        ─► job identity.file.scan (worker): decrypt to tmpfs ─► ClamAV INSTREAM
              infected  ─► delete object, status rejected, student sees UPLOAD_REJECTED
              clean     ─► HEIC→JPEG (libheif sandbox) ─► EXIF/metadata strip (sharp / qpdf)
                       ─► re-validate magic bytes ─► new DEK, encrypt ─► final/… [status clean]
                       ─► delete quarantine object
        ClamAV down ─► file stays pending_scan, job retries; the file is never treated as clean
```

**Flow C — Display and reveal**

- Default responses contain masked values only (computed at write time into `display_mask`, so lists never decrypt).
- Admin reveal: `POST …/reveal` with fields and reason; server checks permission and step-up, writes `audit_log` and `identity_access_log` **before** decrypting; if either write fails the request fails and nothing is returned.
- Student self-reveal needs step-up (password or 2FA) and is logged in `identity_access_log`.

**Flow D — Retention and deletion**

- `delete_after = max( least(anchor_completed_at + 30 d, identity_completed_at + 90 d), identity_completed_at + 7 d )`. The 7-day floor only matters for re-submissions after the anchor card is already Completed.
- Hourly sweep enqueues `identity.purge` for due records. Purge is idempotent, deletes objects first, then crypto-shreds and deletes rows, leaves a PII-free tombstone, then emits `identity.deleted`.

**Trust boundaries crossed** (numbering from system HLD §4)

| # | Boundary | M05 specifics |
|---|----------|---------------|
| 1 | Internet → Edge | TLS, request body limit 9 MB on upload routes, per-IP rate limits |
| 2 | Edge → App | Admin routes only on the admin subdomain (separate cookie scope) |
| 3 | App → DB / Storage / Secrets | Ciphertext only leaves the app; KEK read from secrets file at boot; DB role cannot read the KEK |
| 4 | App → Email | Only template key and ids; no identity values in emails |
| — | App → worker sandbox | Scan/convert/strip run in a separate worker container: no network except clamd, CPU/memory/time limits, read-only root filesystem, tmpfs scratch |
| — | Student ↔ admin | Admins see masked data by default; reveal is the only path to plaintext |

## 5. Inputs / outputs to other modules

| From / To | Contract | Failure behaviour |
|-----------|----------|-------------------|
| M02 Auth | Session (`userId`, `kind=student`), step-up check, `student_profiles.full_name`/`email`/`phone` for form prefill | No session → 401; step-up missing → 401 `STEP_UP_REQUIRED` |
| M03 Legal | `consents` write (purpose `identity_vault`, doc version id, IP hash); read active consent text version | Consent text unavailable → submit blocked (503-style `INTERNAL`); never submit without a consent row |
| M04 Payment | `EntitlementPort.isPaid(userId)` | Not paid → 402; `PAYMENT_PROCESSING` → 202 |
| M06 Cards | Out: events `identity.completed {userId, completedAt}`, `identity.deleted {userId, reason}`; In: event `card.completed {userId, cardId, isRetentionAnchor, completedAt}` | Event handler runs in the same DB transaction; failure rolls back the submit (identity stays draft). `card.completed` handler failure rolls back the card completion, so retention timers never silently miss the anchor |
| M07 Partners | Provides `SecureFileService` for proof files; receives `purgeProofs(userId)` call in deletion saga | Purge failure retries; saga not marked complete |
| M08 Accommodation | None. M08 prefills from M02, not from M05, because identity may already be deleted | — |
| M09 Admin | `AuditPort.record`, permission checks `identity.view_masked`, `identity.reveal`, `identity.export`, `identity.purge`; step-up | Audit write failure → reveal denied (fail closed) |
| M11 Emails | Outbox rows `identity_export_ready`, `identity_deletion_confirmed`, `identity_retention_notice` | Retry with backoff; failure does not block deletion |
| M01 Infra | Secrets file for KEK, private bucket with versioning off, ClamAV service, job queue, backups ≤ 35 days | See §9 |
| M10 Consultancy | **None** — no read path to identity tables; DB role for consultancy reports has no grant on `identity_*` | — |

## 6. External dependencies

| Dependency | Purpose | Fallback |
|------------|---------|----------|
| ClamAV (clamd, signature DB updated daily) | Malware scan | Files remain `pending_scan`; identity cannot complete; alert after 15 min; never skip scan (`RISK-ID-AV-DOWN`) |
| libheif (with libde265) in sandbox | HEIC→JPEG | Student may re-upload as JPEG/PNG (UI hint); reject after 3 failed conversions |
| sharp (libvips) | Re-encode raster images, strip EXIF/ICC/XMP, apply orientation | Reject file as `UPLOAD_REJECTED` |
| qpdf + exiftool (sandbox) | PDF structure check, metadata strip | Reject file |
| Object storage (private bucket, DE) | Ciphertext blobs | Upload returns 503-class `INTERNAL`; DB rows are written only after the object write succeeds |
| Secrets file / mounted secret | Master KEK | Boot fails closed if KEK missing; no plaintext fallback |
| M04 entitlement | Paywall | Fail closed |

## 7. Data classification

| Data | Class | Lawful basis | Retention |
|------|-------|--------------|-----------|
| Passport number | Sensitive (government ID) | Art. 6(1)(a) consent | `delete_after` rule (30 d after card 1 Completed, cap 90 d) |
| Passport scan | Sensitive | Art. 6(1)(a) | Same |
| Signature PNG | Sensitive (biometric-adjacent, identifies) | Art. 6(1)(a) | Same |
| Full name (passport), father/mother name | Personal (high) | Art. 6(1)(a) | Same |
| Current / permanent address, phone, identity email | Personal | Art. 6(1)(a) | Same |
| `display_mask` (masked previews) | Personal (low) | Art. 6(1)(a) | Deleted with the record |
| Draft record (not submitted) | Personal / Sensitive | Art. 6(1)(a); nothing is stored before the consent row exists | Delete 30 d after last edit |
| Consent rows (M03 `consents`) | Personal (evidence) | Art. 6(1)(c) accountability | Per M03 |
| `identity_access_log` (who revealed what, reason) | Personal (low) | Art. 6(1)(f) security and accountability | 24 months; no plaintext values |
| `audit_log` entries about identity | Internal | Art. 6(1)(f) | Per M09 (hash chain, no PII values) |
| Deletion tombstone (ids, timestamps, reason) | Internal | Art. 6(1)(c)/(f) proof of erasure | 6 years, no PII |
| Export package | Sensitive | Art. 15/20 | Deleted 7 days after creation |
| DB backups containing the above | Sensitive | — | ≤ 35 days; deletion ledger replayed on restore (`GAP-ID-BACKUP-RESURRECT`) |

## 8. Key decisions

| Decision | Chosen | Alternatives rejected | Why |
|----------|--------|----------------------|-----|
| Key hierarchy | One master KEK in a mounted secret → HKDF purpose keys (`identity-fields`, `identity-files`, `proofs`) → per-user field DEK and per-file DEK, DEKs wrapped and stored in DB | Single key for everything; cloud KMS only | Limits blast radius, cheap rotation (re-wrap DEKs, no data re-encryption), deletion of a DEK crypto-shreds; no cloud-KMS lock-in for Phase 1 (can be swapped behind `CryptoService`) |
| Field encryption granularity | Per-field ciphertext with AAD `userId|recordId|fieldName|v1` | One encrypted JSON blob; DB-level pgcrypto | Prevents swapping ciphertext between rows/fields; app-level keeps keys outside DB; per-field lets masked previews and partial edits work |
| Masking | Mask strings precomputed at write time into `display_mask` | Decrypt on every list view | Lists never touch plaintext; compromise of read-only admin list yields only masks |
| Scan before use | Quarantine → async scan → finalise; pending files never usable | Synchronous scan in request; skip scan if AV down | Matches `RISK-ID-AV-DOWN` (queue, never skip); keeps request latency low |
| HEIC | Server-side conversion in sandbox after scan | Client-side WASM conversion | Cannot trust client output; one trusted code path |
| Image re-encode | Always re-encode images (strips EXIF/GPS, neutralises polyglots) | Strip metadata only | Defence in depth; orientation applied before stripping |
| PDF | Accept only structurally valid, non-encrypted PDFs without active content (`/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile`, `/OpenAction`, `/AA`), ≤ 5 pages; metadata stripped | Rasterise every PDF | Keeps vector quality for legibility; active-content ban removes main risk (`GAP-ID-PDF-ACTIVE-CONTENT` closed as decided) |
| Identity gate semantics | **One-way latch**: completing identity once unlocks cards 1 and 3; later deletion (retention or request) never relocks or alters any card | Relock Available cards when identity is deleted | Retention deletes data 30 days after card 1 while card 3 may still be open; relocking would force re-collection of data we just deleted. Consistent with grandfathering (`REQ-ID-10`, `REQ-CARD-06`). Business confirmation: `GAP-ID-RELOCK-ON-DELETE` |
| Retention anchor | Card flag `identity_retention_anchor` in M06 (set on Blocked Account) | Hard-code card id/slug | Cards are admin-defined (`REQ-CARD-03`) |
| Reveal control | Permission + step-up + mandatory reason + audit-before-decrypt + rate limit 20/h/admin | Permission only | Insider-threat mitigation; every plaintext access attributable |
| Student view of own data | Masked by default; "Show" requires step-up and is logged | Always plaintext to owner | Shoulder-surfing and session-hijack mitigation |
| Consent as lawful basis | Art. 6(1)(a) as specified, with withdrawal = delete | Art. 6(1)(b) contract | Product decision; conditionality risk flagged in `GAP-ID-CONSENT-CONDITIONAL` |
| Deletion approach | Hard delete + crypto-shred + PII-free tombstone | Soft delete | Erasure obligation; only a tombstone remains |
| Student → no email with values | Emails carry no identity values | Include masked details in confirmation email | Email is an unencrypted channel |

## 9. Failure modes (summary)

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| ClamAV down (`RISK-ID-AV-DOWN`) | Files stuck `pending_scan`; identity cannot complete | clamd health check, `pending_scan` age > 15 min alert | Jobs retry with backoff; student sees "checking your file"; never mark clean without scan |
| HEIC conversion fails (`RISK-ID-HEIC`) | Upload rejected | Job result code | Message tells student to export as JPEG; 3 attempts then lock upload for 10 min |
| KEK lost or corrupted (`RISK-ID-KEY-LOSS`) | All identity data unreadable | Boot self-test decrypts canary record; quarterly restore drill | Restore KEK from the second encrypted backup location (M01); data is short-lived so worst case is re-collection |
| Retention sweep does not run (`RISK-ID-RETENTION-SILENT`) | Over-retention | `identity_retention_heartbeat` metric stale > 2 h; overdue count > 0 alert | Rerun sweep; purge is idempotent |
| Backup restore resurrects deleted data (`RISK-ID-BACKUP-RESURRECT`) | Erased data returns | Restore runbook step; `deletion_ledger` diff | Replay deletions from ledger immediately after restore before serving traffic |
| Insider mass-reveal (`RISK-ID-INSIDER-REVEAL`) | Data theft | Rate limit, reveal-volume alert (> 10 distinct students/h), audit review | Revoke role, incident process |
| Plaintext in logs (`RISK-ID-LOG-PII`) | Breach via logs | CI log-redaction test, log scanner for passport regex | Purge logs, fix redaction |
| Malware upload (`RISK-ID-MALWARE-UPLOAD`) | Worker or admin compromise | ClamAV, sandbox, magic bytes | File rejected, alert on infected count spike |
| Metadata leak (`RISK-ID-EXIF-LEAK`) | GPS/device info retained | Test with GPS-tagged image | Re-encode always |
| Event handler failure on submit | Identity complete but cards locked | Transaction rolls back together | Student retries submit |
| Erasure vs invoice (`RISK-LEGAL-ERASURE`) | Conflict with tax law | Legal review (`GAP-DELETION-VS-INVOICE`) | Identity purge never touches M04 invoices; M04 anonymises separately |

## 10. Security and privacy controls (summary)

| Control ID | Control | Layer |
|------------|---------|-------|
| CTRL-ENC-FIELD-AES | AES-256-GCM per-field encryption, random 96-bit IV, AAD binding, key outside DB (`00-traceability.md` spells this `CTRL-ENC-FIELD`; reconcile to the `-AES` form) | API / DB |
| CTRL-ENC-FILE | Envelope encryption of files with per-file DEK in private bucket | Storage / API |
| CTRL-AV | ClamAV scan before any use; fail-closed | Worker |
| CTRL-ID-UPLOAD | Size cap, magic-byte vs declared type, HEIC convert, re-encode + metadata strip, PDF active-content ban | API / Worker |
| CTRL-ID-CONSENT | Unticked, versioned consent recorded before submit; withdrawal deletes | Frontend / API / DB |
| CTRL-ID-MASK | Precomputed masks; no plaintext in default responses | API |
| CTRL-ID-REVEAL | Permission + step-up + reason + audit-before-decrypt + rate limit | API / M09 |
| CTRL-ID-KEYS | HKDF hierarchy, key versioning, rotation by re-wrap, boot canary | API / Ops |
| CTRL-ID-RETENTION | `delete_after`, hourly sweep, heartbeat, tombstone, ledger replay | Jobs |
| CTRL-DSR | Export, deletion, withdrawal within 30 days (automated within 1 h target) | API / Jobs |
| CTRL-ID-NOLOG | Request-body logging disabled on identity routes; redaction paths; no PII in job payloads | Logs |
| CTRL-ID-ISOLATION | RLS, masked DB view for lists, no consultancy grants | DB |

## 11. Test strategy

- **Unit:** crypto round-trip and AAD mismatch, mask functions, retention date calculation, Zod schemas, magic-byte detector, completeness rules.
- **Integration (real Postgres, MinIO, ClamAV with EICAR):** draft→submit→events, pipeline stages (infected, bad magic, HEIC, EXIF/GPS strip, active-content PDF), reveal audit fail-closed, retention sweep with clock control, purge idempotency, export package contents, RLS cross-user denial, unpaid denial.
- **E2E (Playwright):** unpaid student blocked, full identity flow on mobile viewport with canvas signature, masked display, student reveal with step-up, deletion request and cards unaffected.
- **Security:** IDOR on file ids, reveal rate limit, log scan for PII, ciphertext swap between rows/fields, key-version rotation.
- Test IDs are listed in `lld.md` §11 (`T-ID-001 … T-ID-065`). Existing IDs `T-ID-001`, `T-ID-002`, `T-ID-010`, `T-ID-011`, `T-ID-020`, `T-ID-030`, `T-SEC-010` keep their meanings from `00-traceability.md` and `00-security-controls.md`.

## 12. Open questions

| ID | Question | Owner | Status |
|----|----------|-------|--------|
| GAP-IDENTITY-PURPOSE | Who needs passport data (NIVO vs partners)? Default: NIVO only. Consent text must name the purpose precisely; M05 stores no partner-share flag until decided. | Product + Lawyer | Open (High, existing) |
| GAP-IDENTITY-RETENTION | Exact days: 30 after card 1 Completed, cap 90 from identity completion (this HLD defines the cap anchor). | Lawyer | Provisional (High, existing) |
| GAP-ID-CONSENT-CONDITIONAL | Consent is required to proceed (identity gates card 1). GDPR Art. 7(4) questions whether consent is freely given when service depends on it. Alternative basis: Art. 6(1)(b). | Lawyer | Open (High) |
| GAP-ID-RELOCK-ON-DELETE | Business confirms the one-way latch (identity deleted → no card relocks). | Product | Open (Medium) |
| GAP-ID-ADMIN-REVEAL-APPROVAL | Should reveal require a second approver (maker-checker) in addition to reason + audit? Default: no, with alerts. | Product + Security | Open (Medium) |
| GAP-ID-BACKUP-RESURRECT | Backup ≤ 35 days and ledger replay on restore must be documented in the privacy policy and M01 runbook. | M01 + Lawyer | Open (Medium) |
| GAP-ID-HARDCAP-INFLIGHT | Hard cap reached while card 1 is In progress: identity deleted, card stays In progress (latch). Confirm that no re-collection prompt is wanted. | Product | Open (Medium) |
| GAP-ID-UPLOAD-MSG | `UPLOAD_REJECTED` catalog message omits HEIC; update to "JPG, PNG, HEIC or PDF under 8 MB". | Eng | Open (Low) |
| GAP-DELETION-VS-INVOICE | Existing: identity purge never touches invoices. | Lawyer | Provisional (High, existing) |
