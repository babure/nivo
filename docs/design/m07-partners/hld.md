# HLD: M07 — Partners

| Field | Value |
|-------|-------|
| Module | M07 |
| Status | Review |
| Owner | NIVO platform team (design) |
| Last updated | 2026-11-24 |
| Requirements | REQ-PART-01, REQ-PART-02, REQ-SEC-02 (proof purge), REQ-CARD-10 (trigger side), REQ-PART-03 … REQ-PART-08 (new, see §2) |

## 1. Purpose and scope

M07 connects students to partners (blocked-account provider, SIM provider and similar) and records evidence that the student completed the partner step.

**In scope**

- Partner and tracked-link management (admin): URL templates with a fixed placeholder set, referral code, host allow-list, versioning with maker-checker publish, link health checks.
- Launch flow: the student clicks a card button → NIVO logs the click, marks the card started and redirects to the partner with the referral code and a student placeholder resolved.
- **Completion option C (Phase 1):** the student uploads proof; an admin approves or rejects. Approval completes the card through M06 in the same transaction (which evaluates SIM unlock and queues the "SIM unlocked" email).
- **Options A and B (Phase 2 stubs):** option A = partner webhook, option B = partner CSV import. Phase 1 defines the adapter interface, settings flags (off), reserved error handling and design constraints. No endpoints are exposed.
- Proof file storage through the M05 `SecureFileService`, proof retention and purge, admin proof queue.

**Out of scope**

- Card statuses and unlock rules (M06), identity data (M05), accommodation leads (M08), consultancy referral attribution (M10 — different "referral": consultancy referral identifies who sent the student to NIVO; the partner referral code identifies NIVO at the partner).
- Money flows. NIVO never holds partner money; contracts are student ↔ partner. Commission reconciliation outside the platform uses the click log as evidence only.
- Partner-side APIs, automated verification of proofs (Phase 2).

## 2. Requirements covered

IDs `REQ-PART-01/02` exist in `00-traceability.md`. `REQ-PART-03…08` are introduced here and must be added to the traceability matrix when this HLD is frozen.

| ID | Statement | Priority |
|----|-----------|----------|
| REQ-PART-01 | Tracked partner links with referral code and student ID placeholders; every click is logged | Must |
| REQ-PART-02 | Completion option C: student proof upload; admin approve/reject | Must |
| REQ-PART-03 | Click log records who, which partner/link/card, when, the resolved host and a unique `click_id`; append-only | Must |
| REQ-PART-04 | URL templates accept only whitelisted placeholders (`{{referral_code}}`, `{{student_id}}`, `{{click_id}}`), HTTPS and allow-listed hosts; changes need maker-checker | Must |
| REQ-PART-05 | On proof approval the card is Completed, SIM unlock is evaluated and the "SIM unlocked" email is queued, all in one transaction | Must |
| REQ-PART-06 | Completion options A (webhook) and B (CSV) exist as Phase 2 stubs behind disabled flags with a defined adapter contract | Should |
| REQ-PART-07 | Proof files are envelope-encrypted, scanned, retention-limited and purged on account deletion | Must |
| REQ-PART-08 | Partner link health is checked daily; broken links alert admins and show a maintenance state to students | Should |
| REQ-CARD-10 | "SIM unlocked" email queued exactly once in the unlock transaction (executed by M06 on M07's call) | Must |
| REQ-SEC-02 | Account deletion also purges proofs and detaches click rows | Must |

## 3. Component diagram

```
Student SPA (CardDetail, ProofUploader, ProofHistory)       Admin SPA (Partners, Links, Proof queue)
        │  ① GET /r/{token} (anchor click, top-level navigation)       │
        ▼                                                              ▼
apps/api ── M07 module ─────────────────────────────────────────────────────────┐
  │  LaunchController  (/r/:token)           ProofController (student)          │
  │  LaunchTokenService (HMAC, TTL 30 min)   AdminProofController (queue/review)│
  │  LinkResolver (template → URL, validator) PartnerAdminController            │
  │  ClickLogger (append-only link_clicks)   ProofService                       │
  │  CompletionAdapters:                                                       │
  │     ProofUploadAdapter  (Phase 1, active)                                  │
  │     WebhookAdapter (A)  CsvAdapter (B)   (Phase 2 stubs, disabled)         │
  │  LinkHealthChecker (job)                  RetentionService (proof files)    │
  │  ports: CardEngine (M06), SecureFileService (M05), ApprovalGate/Audit (M09),│
  │         EmailOutbox (M11), Entitlement (M04)                                │
  └─────────────────────────────────────────────────────────────────────────────┘
        │                      │                         │
        ▼                      ▼                         ▼
   PostgreSQL 16         Object storage             Job queue
   partners              (proof ciphertext via      partners.link.health
   partner_links         SecureFileService)         partners.proof.retention
   link_clicks                                      partners.proof.digest
   proofs, proof_files                              secure-file scan (M05)
        │
        ▼
   Partner site (outbound redirect only in Phase 1)
```

| Component | Responsibility |
|-----------|----------------|
| LaunchTokenService | Issues short-lived, user-bound HMAC tokens embedded in the card detail response; validates on click |
| LinkResolver | Validates templates at save and publish; resolves placeholders with percent-encoding at click time; re-validates the resolved URL against the allow-list |
| ClickLogger | Inserts `link_clicks` row and calls `CardEngine.startCard` in the same transaction |
| ProofService | Draft → submit → review state machine; one live proof per student per card; file attachment limited to `clean` files |
| AdminProofController | Queue, file streaming (audited), approve/reject with M06 completion in the same transaction |
| CompletionAdapters | Common interface so Phase 2 adapters converge on `CardEngine.completeCard` |
| LinkHealthChecker | Daily HTTPS reachability check per published link |
| RetentionService | Deletes proof files after retention windows; account-deletion purge |

## 4. Data flows and trust boundaries

**Flow A — Launch.** Card detail (M06) calls `PartnerPort.buildLaunchToken(userId, cardId)`; M07 returns `/r/{token}` embedded in the card response only for Available / In progress / Completed cards of a paid student. Student clicks the anchor. `GET /r/{token}` (session cookie, top-level navigation) validates token signature, expiry, token user = session user, paywall, card not Locked, link active. In one transaction M07 inserts `link_clicks`, calls `startCard` (Available → In progress), commits, then answers `302` to the resolved partner URL with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.

**Flow B — Proof upload.** Student creates a draft proof for the card, uploads 1–3 files (each through the M05 pipeline: size, magic bytes, quarantine, ClamAV, HEIC convert, metadata strip, re-encrypt), adds an optional note and submits. Submission requires every file to be `clean`.

**Flow C — Review.** Admin opens the oldest pending proof, views files (stream, decrypt on the fly, audited), then approves or rejects. **Approve** runs in one transaction: lock proof row, set `approved`, call `CardEngine.completeCard` (completes card, evaluates SIM rule, inserts `sim_unlocked` outbox row when the rule is now satisfied, publishes `card.completed` for M05's retention anchor), queue `proof_approved` email, write audit. **Reject** sets `rejected` with reason code and queues `proof_rejected`; the card stays In progress (or Available).

**Flow D — Phase 2 (stubs).** A future adapter receives a partner event keyed by `public_ref`, resolves the student, checks idempotency by `(partner_id, external_event_id)`, then calls the same `completeCard`. Not reachable in Phase 1.

**Trust boundaries**

| # | Boundary | M07 specifics |
|---|----------|---------------|
| 1–2 | Internet → Edge → App | `/r/*` rate limited; edge access log redacts the `/r/` token segment |
| 3 | App → DB / Storage | Proof blobs only as ciphertext; click table append-only |
| — | NIVO → Partner (outbound navigation) | Only the whitelisted placeholder values leave NIVO: partner referral code, opaque `public_ref`, random `click_id`. No name, email, phone, DB user id, payment or identity data |
| — | Admin → students (phishing risk) | Link templates are privileged config: maker-checker publish, host allow-list, HTTPS-only |
| — | Student upload → worker sandbox | Same sandbox as M05 |
| — | Partner → NIVO (Phase 2) | Inbound webhook/CSV will cross a new boundary; requirements in LLD §3 |

## 5. Inputs / outputs to other modules

| From / To | Contract | Failure behaviour |
|-----------|----------|-------------------|
| M02 Auth | Session user; `student_profiles.public_ref` (opaque, unique, non-PII, never the DB id) and `full_name` for the admin reviewer | Missing `public_ref` → launch returns `500 INTERNAL` and alerts (registration must always assign one) |
| M04 Payment | `EntitlementPort.isPaid` on `/r/*` and all proof routes | 402 / 202 |
| M05 Identity | Uses `SecureFileService` (`owner_module='proof'`, purpose `proof`); requires additive column `secure_files.content_sha256` (set by the pipeline for `proof` files only) for duplicate-evidence detection; calls `purgeProofFiles(userId)` in deletion saga | Scan backlog → proof cannot be submitted (409 `FILES_PENDING`) |
| M06 Cards | Calls: `startCard(tx,…)`, `completeCard(tx,…)`; provides: card config (`partner_id`, completion mode), card progress | `completeCard` failure rolls back the approval; admin sees error and retries |
| M08 Accommodation | None | — |
| M09 Admin | Permissions `partners.view`, `partners.edit`, `partners.link.review`, `partners.link.publish`, `partners.proof.review`, `partners.proof.view_files`; approval policies `partners.link.publish` (on), `partners.proof.approve` (off by default, switchable); `audit_log` | Audit failure → action fails closed |
| M10 Consultancy | None. M10 reporting may count cards Completed via M06 view; never clicks or proofs | — |
| M11 Emails | Outbox rows: `proof_received`, `proof_approved`, `proof_rejected`, `admin_proof_queue_digest`; `sim_unlocked` is queued by M06 | Retry; failed email never blocks approval |
| M03 Legal | Partner disclosure copy (`partners.disclosure_i18n` references an M03 text key); proof upload privacy notice | Missing text blocks publish of a partner card |
| M01 Infra | Edge log redaction, outbound HTTPS egress for health checks, job queue | See §9 |

## 6. External dependencies

| Dependency | Purpose | Fallback |
|------------|---------|----------|
| Partner websites (Phase 1: link target only) | Destination of redirect; health check | If down: card shows "partner temporarily unavailable", admin alert; student can still upload proof for work already done |
| ClamAV, libheif, sharp, qpdf (via M05 pipeline) | Proof file hygiene | Files stay `pending_scan`; never submitted unscanned |
| M04 / M06 / M09 / M11 | As in §5 | Fail closed on entitlement and audit |
| Phase 2: partner webhook signing keys, partner IP ranges | Not active | n/a |

## 7. Data classification

| Data | Class | Lawful basis | Retention |
|------|-------|--------------|-----------|
| Partner and link config | Internal | n/a | Versioned; kept |
| `link_clicks` (user id, partner, click id, resolved URL with `public_ref`) | Personal (pseudonymous) | Art. 6(1)(b) tracking progress; Art. 6(1)(f) commission reconciliation | 24 months; on account deletion `user_id` is set NULL (rows become unlinkable because `public_ref` is deleted with the profile) |
| Proof files | Sensitive-adjacent (may contain account numbers, name, IBAN fragments) | Art. 6(1)(b) contract; student chooses what to upload | Approved: files deleted 90 days after approval. Rejected/withdrawn: 30 days after decision. Metadata kept until account deletion |
| `proofs` metadata (status, reviewer, reason code, student note ≤ 500 chars) | Personal | Art. 6(1)(b), (f) | Life of account; note cleared with files |
| `proof_files.content_sha256` | Internal (hash only) | Art. 6(1)(f) fraud prevention | Deleted with the file row |
| Admin review audit | Internal | Art. 6(1)(f) | Per M09 |
| Health-check results | Internal | n/a | 90 days |

## 8. Key decisions

| Decision | Chosen | Alternatives rejected | Why |
|----------|--------|----------------------|-----|
| Launch mechanism | Signed token in an `<a href="/r/{token}">` anchor; `GET` redirect with session | `POST` from SPA then `window.open`; unauthenticated GET with query params | Anchors work with popup blockers and middle-click; the token is unguessable and user-bound so another site cannot forge clicks that pollute the log (`RISK-PART-CLICK-FORGERY`) |
| "Student ID" in URLs | `{{student_id}}` resolves to the opaque `student_profiles.public_ref`, never the primary key, email or name | Raw user UUID; email | Data minimisation; partners cannot correlate with NIVO internals; cannot be used to enumerate accounts. Confirm partners accept this (`GAP-PART-STUDENT-ID`) |
| Placeholder set | Fixed three; unknown placeholders rejected at save | Free-form expressions | No data leakage through templates |
| Link config governance | Template + referral code + allowed hosts versioned together; maker-checker publish | Direct edit | A malicious or mistaken edit can send every student to a phishing page (`RISK-PART-OPEN-REDIRECT`) |
| Redirect safety | Resolved URL re-checked against allow-list at click time; HTTPS only; `302` with `Referrer-Policy: no-referrer` and `no-store` | Trust stored URL | Defence in depth against data corruption and template bugs |
| Click dedupe | Log every click, mark `is_duplicate` within 5 s of the same user+link | Drop duplicates | Evidence completeness plus clean metrics |
| Completion C | Proof upload + admin review; approval completes in the same TX as SIM evaluation | Self-declared completion; async completion | Brief; no unlock without human verification; atomic with email queue |
| Proof storage | Reuse M05 `SecureFileService` (`proofs` key purpose) | Separate storage code | One audited pipeline for untrusted uploads |
| Duplicate evidence | Store SHA-256 of final plaintext; flag matches across students to the reviewer (no cross-student detail shown) | No check; perceptual hashing | Cheap, privacy-light signal against reused screenshots (`RISK-PART-PROOF-FRAUD`) |
| Proof states | `draft → pending → approved / rejected / withdrawn` (data-model enum `proof_status` extended with `draft` and `withdrawn`) | Only three states | Draft needed while scans run; withdraw lets students fix mistakes |
| Maker-checker on proof approval | Policy supported, **off** by default | Always on | Volume and speed; policy flip needs no code change (`GAP-PART-APPROVAL-POLICY`) |
| Phase 2 | Adapter interface + disabled flags, no routes | Build now; leave nothing | Prevents rework: all completion paths converge on `CardEngine.completeCard` |

## 9. Failure modes (summary)

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| Partner URL broken (`RISK-PART-BAD-LINK`) | Dead end for students | Daily health job, click-to-error metric | Admin alert; students see maintenance notice; fix link via approved new version |
| Open redirect / phishing via link edit (`RISK-PART-OPEN-REDIRECT`) | Credential theft | Allow-list + approval + click-time re-check; audit | Disable link immediately (kill switch `partners.link.disable`), notify students |
| Forged or replayed launch tokens (`RISK-PART-CLICK-FORGERY`) | Polluted click log | Invalid-token metric | Short TTL, session binding, rate limit |
| Student identifier leaks to partner (`RISK-PART-ID-LEAK`) | Privacy breach | URL template tests, code review gate | Placeholders restricted to whitelist; public_ref only |
| Fake or reused proof (`RISK-PART-PROOF-FRAUD`) | Wrongful SIM unlock | Duplicate-hash flag, reviewer guidance, optional second approval | Admin override with audit; Card status grandfathering means correction is a manual decision |
| Admin approves while student/another admin acts concurrently | Double completion | Row lock + status check | Second actor gets 409; completion idempotent |
| `completeCard` fails during approval | Approval not recorded | Error surfaced | Whole transaction rolled back; retry |
| Proof scan backlog (`RISK-ID-AV-DOWN` family) | Submissions delayed | Pending-scan age alert (M05) | Student sees "checking your file"; submission blocked until clean |
| Proof review SLA breach | Student waits | Queue age metric, daily digest | Digest email to admins; SLA indicator in queue |
| Retention job fails | Proof files over-retained | Heartbeat metric (same pattern as M05) | Re-run; idempotent |
| Phase 2 adapter enabled prematurely | Unauthenticated completion | Flags default off, routes not registered | Startup assertion fails if flag on without Phase 2 config |

## 10. Security and privacy controls (summary)

| Control ID | Control | Layer |
|------------|---------|-------|
| CTRL-PART-TRACK | Append-only click log with click id; launch only via signed, user-bound token; dedupe flag | API / DB |
| CTRL-PART-PROOF | Proof upload through scan pipeline; admin-only review; approval completes card atomically; duplicate-hash flag; audited file views | API / Worker |
| CTRL-PART-REDIRECT | HTTPS-only, host allow-list at save and at click time, no userinfo, fixed placeholders, `Referrer-Policy: no-referrer` | API |
| CTRL-PART-PSEUDONYM | Only `public_ref`, referral code and `click_id` leave NIVO | API |
| CTRL-ENC-FILE / CTRL-AV | Reused from M05 for proof files | Storage / Worker |
| CTRL-ADM-APPROVAL | Link config publish needs a second admin; optional second approval on proofs | M09 |
| CTRL-ADM-AUDIT | Link publish, proof view, approve, reject audited | M09 |
| CTRL-PART-LOG | Token segment redacted from edge and app logs | Edge / Logs |
| CTRL-CARD-PAYWALL | `/r/*` and proof routes behind PaywallGuard | API |

## 11. Test strategy

- **Unit:** URL template validator and resolver (placeholder whitelist, encoding, allow-list), token sign/verify (tamper, expiry, wrong user), proof state machine, duplicate-hash logic.
- **Integration (Postgres, MinIO, ClamAV, fake partner server):** click logging + `startCard` atomicity, token abuse cases, proof upload through pipeline, approve → SIM unlock → outbox in one transaction, reject path, concurrency between approve/reject, retention purge, link health job, account-deletion purge.
- **E2E (Playwright):** student launch from card, upload proof from mobile viewport, admin approve flow, student sees status.
- **Security:** open-redirect fuzzing on templates, token replay by another user, edge log token redaction, IDOR on proof ids and file ids, admin permission matrix.
- Test IDs are in `lld.md` §11 (`T-PART-001 … T-PART-045`). Existing `T-PART-001` and `T-PART-010` keep their meanings from `00-traceability.md`.

## 12. Open questions

| ID | Question | Owner | Status |
|----|----------|-------|--------|
| GAP-PARTNER-LINKS | Existing: Expatrio / Vodafone / Swarajya parameters. Templates are admin-editable; seed uses placeholders (`https://partner.example/…`). | Anoop | Pending partners (Medium, existing) |
| GAP-PART-STUDENT-ID | Confirm each partner accepts an opaque `public_ref` as "student ID" and which query parameter name they expect. | Anoop | Open (Medium) |
| GAP-PART-APPROVAL-POLICY | Should proof approval require two admins for the SIM card (financially relevant)? Default off. | Product + Security | Open (Low) |
| GAP-PART-PROOF-RETENTION | 90 days after approval / 30 days after rejection for proof files. Confirm with legal and commission needs. | Lawyer + Product | Provisional (Medium) |
| GAP-PART-CLICK-RETENTION | 24 months for click rows (commission reconciliation); confirm. | Lawyer | Provisional (Low) |
| GAP-PART-DISCLOSURE | Wording of the "we may receive commission" disclosure per partner (M03 text). | Lawyer | Open (Medium) |
| GAP-VOUCHER | Existing: Vodafone voucher terms; SIM card text hidden until confirmed. | Product | Open (Low, existing) |
| GAP-PART-PHASE2-FORMAT | Webhook payload and CSV format per partner. Needed before Phase 2 only. | Anoop | Deferred |
