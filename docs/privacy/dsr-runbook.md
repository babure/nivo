# Data Subject Request (DSR) Runbook

| Field | Value |
|-------|-------|
| Status | Review |
| Owner | Operations Approver (day-to-day), Super Admin (escalation), privacy contact (`GAP-DPO`) |
| Last updated | 2026-11-24 |
| Legal clock | **1 month** from receipt (Art. 12(3) GDPR), extendable by 2 months for complex or numerous requests with notice inside the first month. Product target: self-service identity deletion completes **within 1 hour**, exports within 24 hours |
| Related | M05 LLD (`deletion_requests`, `identity.purge`, `identity.export.build`), M02 (account deletion), M09 (`dsr:*` permissions), `retention-schedule.md`, `incident-response.md` |

## 1. Intake channels

| Channel | Route | Notes |
|---------|-------|-------|
| Self-service (preferred) | Student dashboard → Privacy centre: "Download my data", "Delete my identity data", "Delete my account", "Withdraw consent" | Logged-in + step-up; creates `deletion_requests` / export rows automatically; confirmation email |
| Email | privacy@ (placeholder) | Staff create a request on the student's behalf **only after identity verification** (§2) |
| Post / other | Legal address in Impressum | Same as email |
| Via consultancy or third party | Not accepted unless written authority from the student is attached | Reply asking the student to use self-service |
| Supervisory authority | Forwarded by counsel | Treated as Sev 3 incident record |

Every request gets an ID, a received date, a due date (`received + 1 month`) and an owner. Admin inbox: M09 approvals inbox type `dsr` (permission `dsr:read`; decisions `dsr:process`; exports `dsr:export`).

## 2. Verifying the requester

| Situation | Verification |
|-----------|-------------|
| Self-service | Authenticated session + step-up (password or TOTP ≤ 5 min) |
| Email from the registered address | Reply with a one-time confirmation link (M02 token) to the same address; request starts after click |
| Email from another address / no account | Ask for the registered email; do not reveal whether an account exists; require the link flow above. Never ask for a passport copy to verify identity |
| Lost access to email and password | Manual path: support asks 3 verification facts from the account (registration date, country, intake, last 4 characters of the phone) plus a live check by a second admin; document the decision. If doubt remains, refuse and explain (Art. 12(6)) |

## 3. Request types and procedures

### 3.1 Access / export (Art. 15, 20)

1. Student presses "Download my data" (or staff create the request).
2. System builds the package (`identity.export.build` for identity; platform export job for account, payments, cards, leads, consents, access log): JSON + human-readable PDF/HTML, identity files as originals, consent history from M03 `GET /legal/me/consents`.
3. Package is encrypted with the `exports` key, stored 7 days, link requires login + step-up, one download counter limit (5).
4. Email `identity_export_ready` / `data_export_ready` (no attachment).
5. Excluded and explained: internal notes on the student (`students:notes:*`) are provided only where they contain personal data about the student (counsel decision `GAP-DSR-NOTES`), security and fraud data where disclosure would impair detection, data of other people.
6. Log `dsr.export.completed`.

What the export contains

| Area | Included |
|------|----------|
| Account | Profile fields, consent history, sessions list (metadata) |
| Payments | Payment records, invoices, refunds |
| Identity | Current decrypted fields and files while they exist; deletion tombstone if already deleted |
| Cards | Statuses and timeline, proofs metadata and files (if still retained), notify requests |
| Partners | Click log entries |
| Accommodation | Leads and student-visible notes |
| Consultancy | Attribution (consultancy name, code, date), sharing consent state |
| Access log | Who accessed identity data and when |

### 3.2 Rectification (Art. 16)

- Self-service: profile (name locked after payment, contact phone/email changes through support flows `GAP-AUTH-EMAIL-CHANGE`), identity fields editable until deletion.
- Support: corrections requested by email are executed by `students:*` admins through audited flows; passport-name mismatch after payment needs an Operations Approver note.
- Notify recipients where feasible (accommodation agent gets updated snapshot only if the lead is open).

### 3.3 Erasure (Art. 17) — **account or identity**

Scope choices: (a) identity data only, (b) full account. Both create a `deletion_requests` row (M05/M02).

Procedure (system-run saga, idempotent steps; admin only monitors):

| Step | Action | Module |
|------|--------|--------|
| 1 | Request accepted; student sessions revoked (full-account scope); email `identity_deletion_received` | M02, M05 |
| 2 | Identity: crypto-shred DEK, delete encrypted fields and secure files (`identity.purge`), record tombstone, write deletion ledger entry off-DB | M05 |
| 3 | Proofs: delete files and student notes (`purgeProofs`) | M07 |
| 4 | Accommodation leads: delete contact snapshot and messages (closed leads anonymised, open leads closed first with notice to agent) | M08 |
| 5 | Consultancy: remove shared contacts, strip PII from funnel row (counts remain as aggregates), delete dedupe keys, null student link | M10 |
| 6 | Cards: delete `card_progress` and events (aggregate counts retained without IDs) | M06 |
| 7 | Consents: anonymise ledger rows beyond the 3-year evidence period; keep proof that erasure was requested (hashed ID) | M03 |
| 8 | Payments: **keep** payment and invoice records for the statutory period, restrict processing, anonymise recipient name and replace invoice PDF with the anonymised render where law permits (`GAP-DELETION-VS-INVOICE`); no access except finance/tax | M04 |
| 9 | Emails: suppress outbox payloads, delete delivery events beyond 30 days; send `account_deletion_confirmed` to the stored encrypted recipient then wipe it | M11 |
| 10 | Mark `deletion_requests.completed`; audit `dsr.erasure.completed`; confirmation email | M05 |
| 11 | Backups: data ages out within 35 days; `identity.ledger.replay` is mandatory after any restore so erased identity data cannot reappear | M01 |

Refusal grounds documented: statutory retention (invoices), establishment/defence of legal claims (open dispute or chargeback), with partial erasure and written reasons.

If saga step fails: `deletion_requests.failed`, alert Super Admin, retry (`POST /admin/dsr/:id/retry`); due date unchanged.

### 3.4 Restriction (Art. 18)

- Account flagged `restricted` (support sets via M02 admin suspend with reason "restriction"): no processing except storage; sessions revoked; identity retention clock paused only if counsel confirms (`GAP-DSR-RESTRICTION-CLOCK`).
- Lift only with the student's confirmation; notify before lifting.

### 3.5 Objection (Art. 21)

- To processing based on legitimate interest (consultancy attribution, click log, security logs): assess within 10 days. For consultancy attribution: remove the student's link to the consultancy (unattributed) via `referrals.override` approval; funnel row deleted.
- Direct marketing: none in Phase 1.

### 3.6 Withdrawal of consent (Art. 7(3))

| Consent | Action |
|---------|--------|
| Identity processing | Starts identity deletion; cards stay as they are (one-way latch); email `identity_deletion_confirmed` |
| Share progress with consultancy | M03 ledger row `withdrawn`; M10 deletes shared contacts and switches the funnel row to aggregate-only within 1 hour |
| Cookies | Footer "Cookie settings"; new `nivo_consent` cookie and evidence event |
| Accommodation contact sharing | Marks lead `closed (withdrawn)`; agent loses access to contact snapshot |

### 3.7 Automated decisions (Art. 22)

Not applicable. State on request that card unlock is rule-based with human proof review.

## 4. Roles and permissions

| Task | Permission | Approval |
|------|------------|----------|
| See DSR inbox | `dsr:read` | — |
| Decide a student-initiated deletion (rare manual review) | `dsr:process` + step-up | Single actor, audited |
| Build an export on request | `dsr:export` + step-up | — |
| Purge outside normal flow | `identity:purge` | Approval policy `identity.purge` (Super Admin) |
| Retry failed saga | `dsr:process` | — |

## 5. SLAs and tracking

| Stage | Target |
|-------|--------|
| Acknowledge (auto-email) | Immediately |
| Verification complete | 3 working days |
| Self-service identity deletion | ≤ 1 hour |
| Export ready | ≤ 24 hours |
| Full account erasure | ≤ 7 days (cap: 30 days) |
| Complex cases | ≤ 1 month, extension notice by day 25 |

Daily job `dsr.overdue_check` (M09) raises an alert for requests older than 20 days; weekly report to Super Admins.

## 6. Response templates (code-managed in M11)

| Template | Use |
|----------|-----|
| `dsr_received` | Request acknowledged with due date |
| `dsr_verification_needed` | Link or information required |
| `identity_export_ready` / `data_export_ready` | Export link |
| `identity_deletion_confirmed` / `account_deletion_confirmed` | Completion, including retained data statement and backup ageing |
| `dsr_refused_partial` | Reasons per Art. 12(4) with complaint route to the supervisory authority |
| `dsr_extension_notice` | Extension reasons |

## 7. Records

Keep for 3 years: request ID, type, received/verified/completed dates, decision, refusal reasons, operator. No copies of exported personal data are kept after expiry. Metrics reported quarterly: volume by type, median time, overdue count.

## 8. Edge cases

| Case | Handling |
|------|----------|
| Student requests deletion while a payment dispute is open | Delete everything except payment/dispute records; explain |
| Student deletes identity while Card 1 is In progress | Card stays In progress (latch, `GAP-ID-RELOCK-ON-DELETE`); no re-collection prompt |
| Student requests deletion; consultancy has already exported their row | Consultancy is bound by the data-sharing agreement to delete on notice — send notice via M10 (`GAP-CON-ERASURE-NOTICE`) |
| Request from a consultancy on behalf of a student | Not accepted without the student's written authority and our verification |
| Same request repeated | Treat as one if unchanged; manifestly excessive requests may be charged or refused with reasons (counsel) |
| Death of student / legal guardian requests | Escalate to counsel |
| Backup restore | Run `identity.ledger.replay` and rerun erasure for any account listed in the deletion ledger |
