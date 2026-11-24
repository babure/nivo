# HLD: M06 — Cards

| Field | Value |
|-------|-------|
| Module | M06 |
| Status | Review |
| Owner | NIVO platform team (design) |
| Last updated | 2026-11-24 |
| Requirements | REQ-CARD-01, REQ-CARD-02, REQ-CARD-03, REQ-CARD-04, REQ-PAY-02 (consumer side), REQ-UX-01 (dashboard step), REQ-CARD-05 … REQ-CARD-10 (new, see §2) |

## 1. Purpose and scope

M06 is the **dashboard card engine**. It owns what cards exist (admin-defined, versioned), what status each student has on each card, and the rules that unlock cards. It is the single place that changes a card's status, so every other module (M04 payment, M05 identity, M07 partners, M08 accommodation) calls M06 instead of writing statuses itself.

**In scope**

- Admin-defined, flexible cards with draft → review → publish workflow and i18n content.
- Student card statuses: **Locked**, **Available**, **In progress**, **Completed**; plus the display-only state **Coming soon** with a *Notify me* waitlist.
- Initial seed: Card 1 Blocked Account and Card 3 Accommodation become Available after payment **and** identity; Card 2 SIM stays Locked until its required cards are Completed (configurable rules); Card 4 is Coming soon.
- Configurable unlock rules (first consumer: SIM) with impact preview, versioning and **grandfathering**: a card that is already unlocked, In progress or Completed never relocks when rules change.
- Paywall: an unpaid student cannot read cards, card content or launch partner links, including by direct URL or API call.
- Completion API (`completeCard`) used by M07 and M08, evaluating unlock rules in the **same transaction** and queuing the "SIM unlocked" email via the M11 outbox.
- Admin per-student view and audited, approval-gated status override.

**Out of scope**

- Payment processing (M04), identity capture (M05), partner links and proofs (M07), accommodation leads (M08), email rendering (M11), generic publish/approval engine (M09, reused here).
- Consultancy funnel reporting (M10 reads card events through a reporting view, never through M06 APIs).
- Partner-side completion automation (M07 Phase 2 stubs converge on `completeCard`).

## 2. Requirements covered

IDs `REQ-CARD-01…04` and `REQ-PAY-02` exist in `00-traceability.md`. IDs `REQ-CARD-05…10` are introduced here and must be added to the traceability matrix when this HLD is frozen.

| ID | Statement | Priority |
|----|-----------|----------|
| REQ-CARD-01 | Dashboard shows the four cards with status tags | Must |
| REQ-CARD-02 | SIM unlocks when its required cards are Completed | Must |
| REQ-CARD-03 | Flexible cards can be added and edited from admin (draft, review, publish) | Must |
| REQ-CARD-04 | An unpaid student cannot open cards by URL or API | Must |
| REQ-PAY-02 | Cards unlock only on a verified payment webhook (consumed via `payment.confirmed`) | Must |
| REQ-CARD-05 | Statuses Locked / Available / In progress / Completed with defined transitions; no backward movement except audited admin override | Must |
| REQ-CARD-06 | Grandfathering: once unlocked (Available, In progress or Completed), a card never relocks when rules change | Must |
| REQ-CARD-07 | Coming-soon cards show *Notify me*; students are emailed once when the card goes live | Must |
| REQ-CARD-08 | Cards 1 and 3 become Available only after payment **and** identity; identity completion is a one-way latch (identity deletion later changes nothing) | Must |
| REQ-CARD-09 | SIM unlock rules (all / any / at least N of a card set) are admin-configurable with impact preview and maker-checker | Must |
| REQ-CARD-10 | "SIM unlocked" email is queued exactly once, in the same transaction as the unlock | Must |
| REQ-UX-01 | Dashboard is step 5 of the onboarding stepper | Should |

## 3. Component diagram

```
Student SPA (Dashboard, CardDetail, NotifyMe)           Admin SPA (Cards, Rules, Student cards)
        │ session + CSRF                                         │ admin session + permissions
        ▼                                                        ▼
apps/api  ── M06 module ───────────────────────────────────────────────────────┐
  │  PaywallGuard (preHandler)  ◄── EntitlementPort (M04.isPaid)               │
  │  CardQueryService     (list/detail, redaction of locked content)           │
  │  CardEngine           (single writer of card_progress)                     │
  │     ├ startCard / completeCard / overrideCard                              │
  │     ├ UnlockEvaluator (pure function + SQL batch)                          │
  │     └ GrandfatherGuard (SQL predicates + DB trigger)                       │
  │  CardConfigService    (cards, versions, rules; publish via M09 workflow)   │
  │  WaitlistService      (notify_requests, go-live fan-out)                   │
  │  Event handlers: payment.confirmed, payment.revoked, identity.completed    │
  │  Outbox writer → M11 (card_unlocked / sim_unlocked / card_available)       │
  └────────────────────────────────────────────────────────────────────────────┘
        │                    │                        │
        ▼                    ▼                        ▼
  PostgreSQL 16        Job queue workers         M09 audit_log + approvals
  cards, card_versions cards.fanout
  card_unlock_rules    cards.rule.reeval
  card_progress        cards.notify.waitlist
  card_status_events
  student_milestones
  notify_requests
```

| Component | Responsibility |
|-----------|----------------|
| PaywallGuard | Fastify `preHandler` on every student route of M05–M08 and `/r/*`; resolves entitlement from M04 on each request (no cached "paid" flag in the session) |
| CardQueryService | Builds dashboard view; for Locked cards returns only title, summary, lock reason and prerequisite titles — never body content, partner URLs or launch tokens |
| CardEngine | Only writer of `card_progress`; enforces transitions, row locking order, grandfathering, event log and outbox writes |
| UnlockEvaluator | Evaluates `all` / `any` / `at_least` rules against the student's Completed set; used inline (one student) and in batch (rule change) |
| GrandfatherGuard | Guarantees automatic evaluation can only move `locked → available`; database trigger rejects other regressions |
| CardConfigService | CRUD for cards, versions and rules, validation (acyclic, referenced cards live), delegates review/publish to M09 |
| WaitlistService | Stores *Notify me*, fans out `card_available` emails on go-live, rate-limited |
| student_milestones | Small table (`paid_at`, `identity_completed_at`) written by event handlers; lets M06 materialise rows for cards published later without calling M04/M05 |

## 4. Data flows and trust boundaries

**Flow A — Payment confirmed (M04 → M06).** The Stripe webhook handler in M04 (signature verified, idempotent) calls `onPaymentConfirmed` inside its own transaction. M06 writes `student_milestones.paid_at` and one `card_progress` row for every live, non-Coming-soon card. Cards 1 and 3 are inserted as `locked / IDENTITY_INCOMPLETE`; SIM as `locked / PREREQUISITES_NOT_MET` (see decision on identity latch). Browser return from Stripe never unlocks anything.

**Flow B — Identity completed (M05 → M06).** `identity.completed` runs in M05's submit transaction. M06 sets `student_milestones.identity_completed_at` and re-evaluates this student's locked rows: cards that required identity become `available` (or `locked / PREREQUISITES_NOT_MET` when they also have an unmet rule).

**Flow C — Start and complete.** Student actions (partner link click in M07, accommodation enquiry in M08, explicit *Start*) call `startCard`. Completion events (proof approved in M07, lead Booked in M08, admin manual) call `completeCard`. `completeCard` locks the student's progress rows, completes the card, emits `card.completed` (M05 consumes it to set the identity retention anchor), evaluates unlock rules for the student's Locked rows, inserts the "SIM unlocked" outbox row, and commits once.

**Flow D — Rule or card change.** Admin edits a draft, previews impact (how many Locked students would unlock; how many are grandfathered), submits for review; a second admin approves; publish bumps the settings version and enqueues `cards.rule.reeval` / `cards.fanout`. Re-evaluation only touches Locked rows.

**Flow E — Read path.** Every student read goes `Session → PaywallGuard → CardQueryService`. Unpaid → `402 PAYMENT_REQUIRED`. Locked detail → `403 CARD_LOCKED` or `403 IDENTITY_INCOMPLETE`. Unknown or unpublished slug → `404`.

**Trust boundaries**

| # | Boundary | M06 specifics |
|---|----------|---------------|
| 1–2 | Internet → Edge → App | Rate limits on card endpoints; admin routes only on admin subdomain |
| 3 | App → DB | `nivo_app` role; trigger blocks status regressions; RLS `user_id = app.user_id` for students |
| — | Student ↔ card content | Content for Locked cards is withheld server-side; the SPA route guard is convenience only |
| — | Admin ↔ student state | Direct status edits are possible only through the override endpoint (permission + approval + reason + audit) |
| — | Module ↔ module | Other modules cannot update `card_progress` directly; DB grants allow writes only from the CardEngine's DB role/function set |

## 5. Inputs / outputs to other modules

| From / To | Contract | Failure behaviour |
|-----------|----------|-------------------|
| M02 Auth | Session (`userId`, `kind`); `email_verified`; order of guards: auth → verified → terms (M03) → paywall | 401 / 403 `AUTH_EMAIL_NOT_VERIFIED` / 403 `TERMS_REACCEPT_REQUIRED` |
| M03 Legal | Terms re-accept check upstream; disclosure copy shown on card detail (partner disclosure text key) | If check unavailable, deny (fail closed) |
| M04 Payment | In: `payment.confirmed {userId, paidAt}` (same TX as M04's paid upsert), `payment.revoked {userId}` (refund / reversal); `EntitlementPort.isPaid(userId)` per request | `isPaid` failure → 503-class `INTERNAL`; deny. Refund closes the paywall but leaves `card_progress` untouched (access is evaluated at request time) |
| M05 Identity | In: `identity.completed {userId, completedAt}`; `identity.deleted` is received and **ignored** for status purposes (logged); Out: `card.completed {userId, cardId, isRetentionAnchor, completedAt}` | Handler failure rolls back the emitting transaction |
| M07 Partners | In: `CardEngine.startCard(tx, …)`, `CardEngine.completeCard(tx, …)` called inside M07's transaction; Out: `PartnerPort.buildLaunchToken(userId, cardId)` for partner cards (only when status ∈ Available / In progress / Completed) | Port failure → card detail returns without launch button and `degraded: true`; no status change |
| M08 Accommodation | In: `startCard` on enquiry, `completeCard` on lead Booked; Out: card 3 detail embeds route `/accommodation` | Same as M07 |
| M09 Admin | Permissions `cards.view`, `cards.edit`, `cards.review`, `cards.publish`, `cards.override`, `cards.rules.edit`; approval policies `cards.publish`, `cards.rules.publish`, `cards.override`; `audit_log`; settings versioning | Approval pending → 409 `APPROVAL_REQUIRED` |
| M10 Consultancy | Read-only reporting view `card_funnel_v` (counts and timestamps keyed by pseudonymous `consultancy_id` cohort); no direct table grants | — |
| M11 Emails | Outbox rows `sim_unlocked`, `card_unlocked`, `card_available`; `dedupeKey` mandatory | Retry; failed email never rolls back the unlock |
| M01 Infra | Postgres, job queue | See §9 |

## 6. External dependencies

| Dependency | Purpose | Fallback |
|------------|---------|----------|
| PostgreSQL 16 | State, locks, trigger, RLS | None; fail closed |
| Job queue (M01) | Fan-out, rule re-evaluation, waitlist mail | Retry; admin can re-run from admin UI |
| M04 entitlement service | Paywall truth | Deny on failure |
| M11 outbox | Emails | Retry; alert on backlog |
| M09 workflow + audit | Publish and override control | Publish/override blocked if unavailable |

## 7. Data classification

| Data | Class | Lawful basis | Retention |
|------|-------|--------------|-----------|
| Card definitions and versions | Public (when published) / Internal (drafts) | n/a | Kept; archived cards retained for history |
| `card_progress` (per student status, timestamps) | Personal (low) | Art. 6(1)(b) contract | Life of account; anonymised/deleted by account deletion saga (M02) |
| `card_status_events` | Personal (low) | Art. 6(1)(b), (f) | 24 months, then aggregate-only; deleted with account |
| `student_milestones` | Personal (low) | Art. 6(1)(b) | Life of account |
| `notify_requests` | Personal (low) | Art. 6(1)(a) explicit request to be notified | Deleted after the notification is sent plus 30 days, or on cancel / account deletion |
| Admin override rows (reason text) | Internal | Art. 6(1)(f) | Per M09 audit retention |

No identity data, payment data or partner proofs are stored by M06.

## 8. Key decisions

| Decision | Chosen | Alternatives rejected | Why |
|----------|--------|----------------------|-----|
| Single writer | `CardEngine` is the only code path that updates `card_progress` | Each module updates statuses | One place for grandfathering, locking, events and emails; testable invariants |
| Materialised status | One `card_progress` row per student per live card, created on payment | Compute status on read from payments/identity/proofs | Grandfathering requires remembering that a card *was* unlocked; reads are cheap |
| Identity as one-way latch | `identity_completed_at` set once; deletion never relocks | Relock on deletion | Retention deletes identity 30 days after card 1 while card 3 may be open; consistent with `REQ-ID-10` and grandfathering. Clarifies integration-matrix wording "opens cards 1+3 on paid": rows exist after payment but stay Locked(`IDENTITY_INCOMPLETE`) until identity completes |
| Grandfathering enforcement | Triple: (1) automatic evaluation SQL has `WHERE status = 'locked'`; (2) DB trigger rejects backward transitions unless an approved override id is set in the session; (3) tests with rule-change simulations | Application check only | `RISK-CARD-RELOCK` is a business-breaking failure; defence in depth |
| Rule model | JSON rule `{mode, requiredCards[], min?}` in versioned `card_unlock_rules` (renamed from data-model `sim_unlock_rules`: SIM is the first consumer, any card may have a rule) | Hard-coded SIM prerequisites; arbitrary expression language | Matches "configurable SIM unlock rules" without opening an injection surface |
| Default SIM rule | All of Card 1 (Blocked Account) **and** Card 3 (Accommodation) Completed | Card 1 only; any one | Provisional until Product confirms (`GAP-CARD-SIM-DEFAULT`) |
| Evaluation timing | Inline in the transaction that completed the prerequisite card | Async job after completion | Required by brief; avoids a window where proof is approved but SIM is still locked |
| Email | Outbox row inserted in the same transaction, `dedupeKey = card_unlocked:{userId}:{cardId}` | Send email inline | Exactly-once effect and no email without the unlock |
| Coming soon | Card type `coming_soon`, no `card_progress` row; waitlist table; go-live fan-out | Status `coming_soon` per student | Not a student state; one switch for all students. DB enum `card_status` keeps the five values from `00-data-model.md`; `card_progress.status` has `CHECK (status <> 'coming_soon')` and the API derives `coming_soon` for display |
| Paywall location | Server `preHandler` on every route + SPA guard | SPA guard only; session flag | Direct URL / API access must fail (`RISK-CARD-PAYWALL-BYPASS`) |
| Locked content | Withheld in API response | Send everything, hide in UI | Partner URLs and instructions must not leak |
| Admin card edits | Versioned drafts, maker-checker publish (M09 `publish_status`) | Edit live rows | `REQ-ADM-03`, auditability |
| Override | Approval-gated, reason required, only way to move backward | Free admin edit | Prevents silent relock or fake completion |

## 9. Failure modes (summary)

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| Rule change relocks active students (`RISK-CARD-RELOCK`) | Students lose progress | Trigger exception, invariant tests, nightly invariant query (no `card_status_events` regressions without override id) | Prevented by design; if detected, revert via approved override with audit |
| Paywall bypass by URL/API (`RISK-CARD-PAYWALL-BYPASS`) | Free access to paid content | E2E route matrix test in CI, unauthorised-access metric | Fix route registration; routes are registered through a wrapper that requires an explicit `paywall: 'required' \| 'exempt'` flag (lint fails otherwise) |
| Concurrent completions deadlock or double-unlock (`RISK-CARD-RACE`) | Duplicate emails or 500 | Deadlock metric, outbox unique key | Row locks in fixed order (by card id), retry on `40P01`, unique `dedupeKey` |
| Webhook delayed (`RISK-PAY-WEBHOOK-LOST`) | Paid student sees paywall | M04 reconcile job | M04 reconcile triggers `payment.confirmed` later; UI shows `PAYMENT_PROCESSING` |
| Refund after SIM unlocked (`RISK-PAY-REFUND-AFTER`) | Access closes, statuses remain | M04/M09 warning | Ops decision; statuses preserved so reinstatement is lossless |
| Rule references archived card | SIM can never unlock | Validation at save and archive | Archive blocked while referenced (409) |
| Fan-out / re-eval job fails midway | Some students not updated | Job heartbeat, count of Locked rows that satisfy the current rule (monitor query) | Idempotent re-run |
| Outbox backlog | "SIM unlocked" late | Queue age alert | Retry; unlock itself is already committed |
| Partner link service down | Card detail lacks launch button | `degraded` flag metric | Student can retry; status unaffected |
| Admin publishes broken content | Bad copy live | Preview + review step | Roll back to previous version (publish previous as new version) |

## 10. Security and privacy controls (summary)

| Control ID | Control | Layer |
|------------|---------|-------|
| CTRL-CARD-PAYWALL | Server-side `PaywallGuard` on all student routes, per-request entitlement check, 402 on unpaid, SPA guard as UX only | API / Frontend |
| CTRL-CARD-SIM | Unlock rules evaluated in the completing transaction, rule validation, impact preview | API / DB |
| CTRL-CARD-GRANDFATHER | Evaluation limited to Locked rows + regression-blocking trigger + override approval id | API / DB |
| CTRL-CARD-REDACT | Locked cards never include body, partner URL or launch token in responses | API |
| CTRL-ADM-PUBLISH | Card and rule versions go through draft → review → publish; author cannot approve own change | M09 |
| CTRL-ADM-PERM | Card admin permissions are separate (`cards.*`); override needs approval | M09 |
| CTRL-ADM-AUDIT | All publishes, rule changes and overrides audited with before/after | M09 |
| CTRL-CARD-OUTBOX | Dedupe-keyed outbox writes in the state-change transaction | DB / Jobs |
| CTRL-CARD-CONTENT-SAFE | Card body is markdown rendered with a sanitiser allowing no raw HTML, scripts or inline styles; links `https:` only; external links `rel="noopener noreferrer"` | Frontend / API |

## 11. Test strategy

- **Unit:** `UnlockEvaluator` truth tables (all/any/at_least, empty and oversized sets), transition guard table, rank function, rule schema validation incl. cycle detection.
- **Integration (Postgres):** payment → rows materialised; identity → unlock; completion → SIM unlock + outbox in one transaction; rollback leaves nothing; grandfathering simulations across rule publish; trigger blocks regressions; concurrency tests (parallel completions of the two prerequisite cards produce exactly one unlock and one outbox row); fan-out for new cards; waitlist mail.
- **E2E (Playwright):** unpaid deep link to `/dashboard/cards/blocked-account` → redirect to payment; API direct call → 402; four-card dashboard with tags and SIM prerequisite hint; Notify me toggle.
- **Security:** route-matrix test that every registered student route has a paywall flag; locked content redaction; IDOR across students.
- Test IDs are in `lld.md` §11 (`T-CARD-001 … T-CARD-063`). Existing `T-CARD-001`, `T-CARD-010`, `T-CARD-020`, `T-CARD-030` keep their meanings from `00-traceability.md`.

## 12. Open questions

| ID | Question | Owner | Status |
|----|----------|-------|--------|
| GAP-CARD-SIM-DEFAULT | Which cards must be Completed before SIM unlocks? Default seeded: Card 1 and Card 3 (all). | Product | Open (Medium) |
| GAP-CARD4-CONTENT | Title, icon and blurb for Card 4 (Coming soon). Seed uses placeholder copy. | Product | Open (Low) |
| GAP-CARD-REFUND-ACCESS | After refund: paywall closes but progress stays. Confirm business wants that (vs. wiping progress). | Product + Lawyer | Open (Medium; relates to `GAP-REFUND`) |
| GAP-CARD-ARCHIVE-VISIBILITY | Archived cards stay visible read-only to students who already progressed. Confirm. | Product | Open (Low) |
| GAP-VOUCHER | Existing: Vodafone voucher terms; card copy hidden until confirmed. | Product | Open (Low, existing) |
| GAP-ID-RELOCK-ON-DELETE | See M05: identity deletion never relocks cards. | Product | Open (Medium) |
