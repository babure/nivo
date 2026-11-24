# HLD: M08 — Accommodation

| Field | Value |
|-------|-------|
| Module | M08 |
| Status | Review |
| Owner | NIVO platform team (design) |
| Last updated | 2026-11-24 |
| Requirements | REQ-ACC-01, REQ-ACC-02, REQ-SEC-02 (lead anonymisation), REQ-CARD-10 (trigger side), REQ-ACC-03 … REQ-ACC-08 (new, see §2) |

## 1. Purpose and scope

M08 is the **accommodation enquiry and lead workflow** behind Card 3. A paid student with complete identity opens an in-site accommodation page, submits an enquiry, and a named accommodation agent (Roshan) is notified by email within one minute. The agent works the lead through a fixed pipeline in a leads-only portal. The student sees the current status. Admins can monitor, correct, reassign and export leads.

**In scope**

- Accommodation page inside the dashboard (agent profile, how it works, disclaimers) and the enquiry form (name and email prefilled).
- Lead lifecycle **New → Contacted → Viewing → Booked → Closed** with audited transitions and close reasons.
- Notification pipeline to the agent: email in ≤ 1 minute, retry, backup recipient, watchdog; WhatsApp as a later channel behind an interface.
- Agent login with a **leads-only** role: sees only leads assigned to them, with minimal fields.
- Student status view and withdrawal.
- Admin lead list, correction, reassignment, notification monitor, **CSV export** (approval-gated).
- Card integration: enquiry starts Card 3; lead **Booked** completes Card 3 through M06 (which evaluates SIM unlock in the same transaction).
- Retention and anonymisation of lead personal data.

**Out of scope**

- Housing inventory, listings, search, payments, deposits, rental contracts (student ↔ landlord/agent; NIVO is not a party).
- Agent CRM features beyond status and notes, WhatsApp implementation (Phase 2, `GAP-WHATSAPP`), calendar/viewing scheduling.
- Identity vault access: M08 never reads M05 data; prefill uses M02 profile data.
- Card rules and statuses (M06), consents storage (M03), email provider (M11), role/permission engine (M09).

## 2. Requirements covered

IDs `REQ-ACC-01/02` exist in `00-traceability.md`. `REQ-ACC-03…08` are introduced here and must be added to the traceability matrix when this HLD is frozen.

| ID | Statement | Priority |
|----|-----------|----------|
| REQ-ACC-01 | Accommodation enquiry notifies Roshan by email within 1 minute of submission | Must |
| REQ-ACC-02 | Accommodation agent role is limited to leads (no access to students, payments, identity, cards, other admin areas) | Must |
| REQ-ACC-03 | In-site accommodation page with enquiry form; name and email prefilled from the account | Must |
| REQ-ACC-04 | Lead status pipeline New → Contacted → Viewing → Booked → Closed with audit trail | Must |
| REQ-ACC-05 | Student sees the status of their enquiry; can withdraw | Must |
| REQ-ACC-06 | Admin can export leads as CSV (formula-safe, approval-gated, audited) | Must |
| REQ-ACC-07 | Notification channel abstraction: email now, WhatsApp later without redesign | Should |
| REQ-ACC-08 | Lead personal data is shared with the agent only with explicit consent, and is anonymised 12 months after closing or on deletion/withdrawal | Must |
| REQ-CARD-10 | "SIM unlocked" email queued in the unlock transaction when Booked completes Card 3 and satisfies the SIM rule | Must |
| REQ-SEC-02 | Account deletion anonymises leads | Must |

## 3. Component diagram

```
Student SPA (AccommodationPage, EnquiryForm, LeadStatusCard)
        │ session + CSRF, PaywallGuard
        ▼
apps/api ── M08 module ──────────────────────────────────────────────────────────┐
  │ AccommodationController (student)      AgentLeadController (role: agent)      │
  │ AdminLeadController (admin)            ExportController (admin)               │
  │ LeadService   (create, transition, assign, anonymise)                         │
  │ NotificationService → NotificationChannel[]  (EmailChannel active,            │
  │                                               WhatsAppChannel stub, disabled) │
  │ Watchdog (SLA monitor)    ExportBuilder (job)    RetentionService             │
  │ ports: CardEngine (M06), ConsentPort (M03), Audit/Approval (M09),             │
  │        EmailPort (M11, priority lane), M02 profile read, Entitlement (M04)    │
  └───────────────────────────────────────────────────────────────────────────────┘
        │                         │                              │
        ▼                         ▼                              ▼
  PostgreSQL 16 (RLS)       Job queue (priority lane)       Email provider (M11)
  accommodation_leads       accommodation.lead.notify        → Roshan (primary)
  lead_status_events        accommodation.notify.watchdog    → ops backup
  lead_notes                accommodation.export.build
  lead_notifications        accommodation.lead.retention
                            accommodation.lead.digest
Agent browser (admin subdomain, 2FA) ──► /api/agent/** ──► RLS: agent sees own leads only
```

| Component | Responsibility |
|-----------|----------------|
| LeadService | Single writer of `accommodation_leads`; enforces transitions, row locks, card integration, audit |
| NotificationService | Creates `lead_notifications` rows in the lead transaction, enqueues a priority job transactionally, tracks SLA |
| NotificationChannel | Interface (`email`, `whatsapp`); channel list comes from settings |
| Watchdog | Every 15 s finds notifications queued > 45 s and escalates |
| AgentLeadController | Leads-only API with RLS-backed scope; no access to any other module's endpoints |
| ExportBuilder | Builds formula-safe CSV after approval; stores encrypted for 24 h |
| RetentionService | Anonymises leads 12 months after closing and on deletion/withdrawal |

## 4. Data flows and trust boundaries

**Flow A — Enquiry.** Student opens the page (`GET /api/accommodation/page`: card must be Available/In progress, so payment and identity are already satisfied). Form is prefilled with `student_profiles.full_name` and account email. On submit the API, in one transaction: validates, records consent (M03) for sharing with the agent, inserts the lead (`new`), assigns the default agent, inserts the `lead_notifications` rows, calls `CardEngine.startCard` (Card 3 → In progress), queues the student confirmation email, and enqueues the notify job (transactional enqueue — no job if the transaction rolls back).

**Flow B — Notify (≤ 1 min).** A worker on the priority lane picks the job within about a second (LISTEN/NOTIFY wake-up plus 1 s poll), renders a **minimal** email (reference, city, arrival date, budget, portal link — no name, email or phone), sends via M11 with a 5 s provider timeout. Retries at +5 s, +10 s, +20 s. After two failures the backup recipient is notified. A watchdog escalates anything still unsent after 45 s to Super Admins. Target: p95 ≤ 20 s, hard limit 60 s.

**Flow C — Agent work.** Agent logs in (2FA), opens the lead in the portal (contact details visible only here), contacts the student outside NIVO, and moves the status. `Booked` completes Card 3 in the same transaction. Every change is audited and appears to the student as status.

**Flow D — Student view.** `GET /api/accommodation/lead` returns status label, timestamps and own submitted details; never agent notes.

**Flow E — Export.** Admin requests an export with filters and a reason; M09 approval policy `exports` requires a second admin; on approval the job writes a CSV (UTF-8 BOM, formula-safe), the requester downloads it once within 24 h.

**Flow F — Retention.** Daily job anonymises closed leads older than 12 months. Account deletion and consent withdrawal anonymise immediately.

**Trust boundaries**

| # | Boundary | M08 specifics |
|---|----------|---------------|
| 1–2 | Internet → Edge → App | Rate limits on submit; agent and admin routes on admin subdomain only |
| 3 | App → DB | RLS on lead tables by `agent_id`; DB role has no grant on other modules' tables for the agent session role |
| 4 | App → Email provider | Notification content minimal by design; contact details never leave in email |
| — | NIVO → agent (data transfer) | Contact details are shared by consent, shown only inside the portal after login + 2FA; agent becomes an independent controller for data they take out of the portal (`GAP-ACC-AGENT-CONTROLLER`) |
| — | Agent ↔ rest of platform | Agent session carries only `leads.*` permissions; routes outside `/api/agent/**` return 403 |

## 5. Inputs / outputs to other modules

| From / To | Contract | Failure behaviour |
|-----------|----------|-------------------|
| M02 Auth | Student session; `student_profiles.full_name`, account email for prefill; agent users (`user_kind = 'agent'`) with mandatory TOTP 2FA (recommended here, confirm `GAP-ACC-AGENT-2FA`); `public_ref` shown in admin views | Profile read failure → form shown without prefill |
| M03 Legal | `consents` write: purpose `accommodation_agent_share` with consent text version id and IP hash; withdrawal rows; disclaimer text keys | No consent text → form disabled (fail closed) |
| M04 Payment | `EntitlementPort.isPaid` on all student routes | 402 / 202 |
| M05 Identity | **None.** Not read, not queried | — |
| M06 Cards | `startCard(tx, user, 'accommodation')` on enquiry; `completeCard(tx, …, source=lead_booked)` on Booked; card status check for form availability | If Card 3 is Locked/Completed at the time of a status change, the lead transition still succeeds and an alert is raised; M06 failure for another reason rolls back the transition |
| M09 Admin | Roles/permissions: agent `leads.read_own`, `leads.update_status`, `leads.note`; admin `leads.read_all`, `leads.assign`, `leads.correct`, `leads.export`, `leads.notify_resend`; approval policy `exports`; settings with maker-checker; `audit_log` | Audit failure → action fails closed |
| M10 Consultancy | None. Leads are not part of consultancy reporting | — |
| M11 Emails | Priority-lane send for `accommodation_lead_agent_notify`; outbox for `accommodation_enquiry_received`, `accommodation_lead_overdue_digest`; delivery/bounce webhooks update `lead_notifications` | Retry, backup recipient, watchdog escalation (`RISK-ACC-EMAIL-FAIL`) |
| M01 Infra | Postgres RLS, queue with priority and transactional enqueue, edge limits | See §9 |

## 6. External dependencies

| Dependency | Purpose | Fallback |
|------------|---------|----------|
| Email provider via M11 (Brevo EU default, `GAP-EMAIL-PROVIDER`) | Agent notification | Retry ×3, backup recipient after 2 failures, Super Admin alert at 45 s, lead stays visible in portal and admin list |
| Job queue (PostgreSQL-backed) | Notify job, watchdog, export | Watchdog also runs from a second scheduler; if the queue is down the lead is still saved and visible in the portal |
| Agent (Roshan) mailbox | Receives notification | Backup recipient; portal shows New leads regardless |
| WhatsApp Business Cloud API (Phase 2, not active) | Later channel | Email remains primary |

## 7. Data classification

| Data | Class | Lawful basis | Retention |
|------|-------|--------------|-----------|
| Lead name, email, phone, message | Personal | Art. 6(1)(a) consent for sharing with the agent; Art. 6(1)(b) for NIVO's own handling of the enquiry | 12 months after `closed_at`, then anonymised; immediately on withdrawal or account deletion |
| City, arrival date, budget, type, duration | Personal (low) | Same | Kept after anonymisation as non-identifying statistics (no link to user) |
| Agent notes (`lead_notes`) | Personal | Art. 6(1)(f) | Deleted at anonymisation |
| Status events | Personal (low) | Art. 6(1)(b), (f) | Kept with the anonymised lead (no actor PII beyond agent user id) |
| `lead_notifications` | Internal | Art. 6(1)(f) | 90 days |
| Consent rows (M03) | Personal (evidence) | Art. 6(1)(c) | Per M03 |
| Export files | Personal | Art. 6(1)(f), approval + reason | Deleted 24 h after build or first download |
| Agent account | Personal | Art. 6(1)(b)/(f) | Per M02 |

## 8. Key decisions

| Decision | Chosen | Alternatives rejected | Why |
|----------|--------|----------------------|-----|
| Notification content | Minimal email (reference, city, arrival, budget, portal link) | Full lead details in email | Email is an unencrypted channel; contact data stays behind login + 2FA (`RISK-ACC-PII-EMAIL`) |
| Delivery path | Transactional enqueue + priority lane + 1 s polling + LISTEN/NOTIFY | Send inline in request; general outbox batch | ≤ 1 min requirement, atomic with lead creation, no loss on crash |
| Escalation | Retry 5/10/20 s → backup recipient after two failures → watchdog at 45 s | Single attempt | `RISK-ACC-EMAIL-FAIL` (FMEA) |
| Agent scope | Role `accommodation_agent`, RLS by `agent_id`, separate `/api/agent/**` routes, 2FA | Reuse admin role with hidden UI | UI hiding is not security (`CTRL-ADM-PERM`); DB-enforced scope |
| Agent assignment | `agent_id` per lead (default agent from setting) | Single global agent flag | Supports a second agent later without schema change |
| Card completion | Booked → `completeCard` (source `lead_booked`) | Student confirms; admin confirms | Matches Card 3 purpose; agent is the party who knows. Risk of agent error handled by admin correction and audit (`GAP-ACC-COMPLETE-TRIGGER`) |
| Card start | Enquiry submit → `startCard` | Start on page view | Meaningful action only |
| Transition model | Forward-only; `New→Closed`, `Contacted→Booked` allowed (remote students cannot view); admin correction with reason | Strict linear | Reality of remote booking; control via audit |
| Student withdrawal | Close + optional consent withdrawal that anonymises immediately | Delete lead row | Keeps reference for the agent's records; honours Art. 7(3) |
| Export | Approval-gated, formula-safe CSV, one-time download, 24 h | Direct download | `00-security-controls.md` row "Exports" |
| Identity data | Never read; prefill from M02 | Pull from M05 | M05 data may already be deleted; minimisation |
| WhatsApp | Interface + disabled stub | Build now | `GAP-WHATSAPP` deferred |
| Recipient list | Setting with maker-checker (primary + backup) | Hard-coded Roshan address | `GAP-ROSHAN`; redirecting notifications is privileged |

## 9. Failure modes (summary)

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| Email provider down or rejecting (`RISK-ACC-EMAIL-FAIL`) | Lead unseen | `lead_notifications.status`, SLA gauge, bounce webhook | Retry, backup recipient, watchdog alert to Super Admins, manual resend in admin UI; lead is always visible in portal |
| Job queue stalled | No notification | Watchdog from separate scheduler; notifications queued > 45 s | Alert; restart workers; watchdog sends directly via backup path |
| Agent cannot log in (2FA lost) | Leads unattended | Overdue-contact digest | Admin-assisted 2FA reset (M02/M09, audited); admin can reassign leads |
| Agent over-reach (`RISK-ACC-AGENT-OVERREACH`) | Data exposure | RLS tests, route matrix test, access audit | DB-enforced scope; permission review |
| PII in notification email (`RISK-ACC-PII-EMAIL`) | Disclosure | Template contract test | Template has no contact fields; test fails if added |
| CSV formula injection (`RISK-ACC-CSV-INJECTION`) | Code execution in spreadsheet | CSV unit tests with payload corpus | Sanitiser prefixes risky cells |
| Wrong "Booked" by agent | Card 3 wrongly Completed, SIM unlock | Audit, admin review of Booked-without-Viewing metric | Admin correction (status) and M06 override (card); grandfathering means unlock is not auto-reverted |
| Duplicate or spam enquiries | Agent noise | Rate limit, one open lead unique index | Admin closes as `spam` |
| Consent text unavailable | Form disabled | Health check | Fix M03 text |
| Lead PII retained too long | Over-retention | Retention heartbeat, overdue count | Re-run job (idempotent) |
| Card state conflict on Booked | Card not completed | `lead.card_completion_skipped` alert | Admin completes via override with approval |

## 10. Security and privacy controls (summary)

| Control ID | Control | Layer |
|------------|---------|-------|
| CTRL-ACC-NOTIFY | Transactional enqueue, priority lane, retry, backup recipient, watchdog, SLA metric | API / Jobs |
| CTRL-ADM-PERM | Agent role limited to `leads.*`; separate route set; permission checks per endpoint | API / M09 |
| CTRL-ACC-RLS | Row-level security on leads by `agent_id`; agent DB role has no other grants; RLS tests in CI | DB |
| CTRL-ACC-MINIMAL-EMAIL | Notification email carries no contact data | Jobs / Templates |
| CTRL-ACC-CSV | Formula-safe CSV, approval, reason, step-up, one-time download, audit with file hash | API / M09 |
| CTRL-ACC-CONSENT | Explicit consent for sharing with agent; withdrawal anonymises | Frontend / API / DB |
| CTRL-ACC-RETENTION | 12-month anonymisation job with heartbeat | Jobs |
| CTRL-ADM-AUDIT | Every status change, assignment, correction, export audited | M09 |
| CTRL-CARD-PAYWALL | All student routes behind PaywallGuard and card gating | API |
| CTRL-AUTH-2FA | TOTP required for agent accounts (REQ-AUTH-05 scope to be extended) | M02 |

## 11. Test strategy

- **Unit:** transition table, notification retry schedule, CSV sanitiser with payload corpus, Zod schemas, label mapping for student status.
- **Integration (Postgres RLS, queue, fake email provider with latency/failure injection):** lead creation atomicity (lead, notification rows, card start, job, consent), notify ≤ 60 s under failure scenarios, watchdog escalation, agent RLS isolation, Booked → card Completed → SIM unlock → outbox in one transaction, anonymisation, export approval flow.
- **E2E (Playwright):** student fills form with prefill, sees status updates driven by agent actions; agent portal session sees only own leads; admin export with second admin.
- **Security:** route matrix for agent session (only `/api/agent/**`), IDOR on lead refs, RLS bypass attempts via crafted queries, email template contract test (no PII fields).
- Test IDs are in `lld.md` §11 (`T-ACC-001 … T-ACC-072`). Existing `T-ACC-001` and `T-ACC-010` keep their meanings from `00-traceability.md`.

## 12. Open questions

| ID | Question | Owner | Status |
|----|----------|-------|--------|
| GAP-ROSHAN | Existing: Roshan's contact details and photo; placeholders in settings. | Anoop | Pending (Medium, existing) |
| GAP-WHATSAPP | Existing: WhatsApp notification; email only in Phase 1; channel interface ready. | Product | Deferred (Low, existing) |
| GAP-ACC-AGENT-CONTROLLER | Is the agent a processor for NIVO or an independent controller after handoff? Default: independent controller, consent + notice + written agent agreement (confidentiality, security, deletion on request). | Lawyer | Open (High) |
| GAP-ACC-COMPLETE-TRIGGER | Card 3 completes when agent marks **Booked**. Confirm vs. student confirmation or admin confirmation. | Product | Open (Medium) |
| GAP-ACC-AGENT-2FA | Mandatory TOTP for agent accounts (not listed in `REQ-AUTH-05`). | Security + M02 | Open (Medium) |
| GAP-ACC-RETENTION | 12 months after close, then anonymise. Confirm with lawyer. | Lawyer | Provisional (Medium) |
| GAP-ACC-CITIES | List of cities the agent serves, and whether out-of-area requests are accepted. | Anoop | Open (Low) |
| GAP-EMAIL-PROVIDER | Existing: Brevo vs SES; priority-lane latency to be measured on chosen provider. | Eng | Provisional (Low, existing) |
