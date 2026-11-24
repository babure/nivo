# User Journeys

| Field | Value |
|-------|-------|
| Status | Review |
| Owner | Product (CEO) with UX |
| Last updated | 2026-11-24 |
| Related | `docs/product/prd.md`, `docs/design/ux/onboarding-spec.md`, `docs/qa/acceptance-tests.md`, `docs/architecture/card-state-machine.md`, module HLDs |
| Format | Each journey: persona, goal, preconditions, steps with system response and module, failure/edge paths, requirement IDs and test IDs |

## 1. Personas

| Persona | Description | Needs | Concerns |
|---------|-------------|-------|----------|
| **Priya** (student) | Indian master's applicant, 24, first time in Europe, mostly on a phone | Clear next step, trust, cheap and fast setup of blocked account, SIM, accommodation | Hidden costs, sharing her passport, scams |
| **Samir** (referred student) | Nepali student introduced by an education consultancy | Same, plus wants the consultancy to help | Privacy towards consultancy |
| **Anoop** (Super Admin, CEO) | Founder, wants control and visibility | Publish links/rules quickly, approve high-risk actions | Mistakes going live, compliance |
| **Abhishek** (Super Admin / Ops approver) | Co-founder, second approver | Fast approvals inbox | Being the single point of failure |
| **Fatima** (Operations Approver / Support) | Handles proofs and student questions | Fast proof review, masked data, resend tools | Making irreversible mistakes |
| **Roshan** (Accommodation Agent) | Partner in Germany handling housing | Leads in one place, quick notifications | Seeing more than needed |
| **Carla** (Consultancy Manager at an agency) | Refers students, wants to see progress | Funnel counts, who needs a nudge | — |
| **Lena** (Counsel / Content-Legal Editor) | Maintains legal text | Versioned publishing, re-acceptance control | Evidence of what users accepted |

## 2. Journey map (Phase 1)

| ID | Journey | Primary actor | Modules |
|----|---------|---------------|---------|
| J1 | Discover → register → verify → pay → identity → dashboard (happy path) | Priya | M02, M03, M04, M05, M06, M11 |
| J2 | Payment fails or webhook is delayed, then retry | Priya | M04, M06 |
| J3 | Referred registration with consultancy | Samir | M10, M02 |
| J4 | Blocked account → proof → SIM unlock | Priya, Fatima | M06, M07, M09, M11 |
| J5 | Accommodation enquiry and status | Priya, Roshan | M08, M11 |
| J6 | Terms updated → re-accept | Priya, Lena | M03, M09 |
| J7 | Identity privacy: view, export, delete | Priya | M05 |
| J8 | Admin changes partner link / SIM rule (draft → approve → publish) | Anoop, Abhishek | M09, M06, M07 |
| J9 | Refund or manual mark-paid with maker-checker | Fatima/Finance, Abhishek | M04, M09 |
| J10 | Consultancy views funnel | Carla | M10 |
| J11 | Admin lost 2FA | Fatima | M02, M09 |
| J12 | Returning user resumes onboarding on another device | Priya | M02, M05, M06 |

## 3. Journeys

### J1 — Happy path onboarding (REQ-UX-01)

**Goal:** Priya goes from landing page to a working dashboard in about 15 minutes.
**Stepper:** 1 Create account → 2 Verify email → 3 Pay €149 → 4 Your details → 5 Your dashboard.

```mermaid
sequenceDiagram
  actor P as Priya
  participant W as Web app
  participant A as API (M02/M03/M04/M05/M06)
  participant S as Stripe
  participant E as Email (M11)
  P->>W: Open home, press "Start your journey"
  W->>P: Cookie banner (3 equal buttons)
  P->>W: Fill register form (name as in passport, email, phone, country, intake, password), tick 18+, Terms+Privacy
  W->>A: POST /auth/register
  A->>E: verify email (queued)
  A-->>W: 202 "Check your inbox"
  P->>E: Click verification link (any device)
  E->>A: POST /auth/verify-email
  A-->>W: verified → login → Pay step
  P->>W: Tick withdrawal acknowledgement, press "Order with obligation to pay"
  W->>A: POST /payments/checkout
  A->>S: Create Checkout Session
  W->>S: Redirect to Stripe
  S-->>A: Signed webhook (paid)
  A->>A: Entitlement granted; cards materialised; invoice job
  A->>E: Receipt + invoice PDF
  W->>A: Poll payment status → paid
  W->>P: Identity: Personal, Family, Address, Passport, Signature, Review (save & resume)
  A->>A: identity.completed → Card 1 and Card 3 Available
  W->>P: Dashboard with four cards
```

| Step | What the student sees | Rules and checks | Module | Test |
|------|----------------------|------------------|--------|------|
| 1 | Home with brand, "A place for new beginnings" CTA | Cookie banner on first visit; no non-essential cookies | M03 | T-LEG-010, T-E2E-10 |
| 2 | Register form | Passport-name helper text; strength meter; Terms + Privacy unticked; optional "Share my progress with my consultancy" | M02, M03 | T-AUTH-001, T-LEG-020, T-E2E-01 |
| 3 | "Check your inbox" with masked email, resend countdown | Enumeration-safe response (same for existing email) | M02, M11 | T-AUTH-010…016 |
| 4 | Verified → login → Pay | Cannot reach dashboard unpaid (paywall) | M02, M04 | T-AUTH-012, T-CARD-030 |
| 5 | Pay page: what €149 covers/does not cover, VAT note, immediate-start tick, trust notes | Server-side amount; consent evidence stored | M04, M03 | T-PAY-001, T-LEG-030 |
| 6 | "We are confirming your payment" then success | Unlock only after verified webhook | M04, M06 | T-PAY-010, T-E2E-02 |
| 7 | Identity sub-steps with "Why we ask / Who sees it" | Consent checkbox, field encryption, scan upload scanned by AV, signature drawn or typed | M05 | T-ID-001…010, T-E2E-03 |
| 8 | Dashboard: Card 1 and 3 Available, SIM Locked ("Complete your Blocked Account to unlock your SIM card"), Card 4 Coming soon | Status tags; SIM progress; help button | M06 | T-CARD-001, T-E2E-03 |

**Edge paths:** expired verification link (resend), email typo (change email on verify screen), browser closed mid-identity (draft saved, resume), unsupported file (clear error, HEIC converted server-side).

### J2 — Payment failure and delayed webhook (REQ-PAY-04)

| Path | System behaviour | Student sees |
|------|------------------|--------------|
| Card declined / cancelled | Payment `failed`/`cancelled`; entitlement unchanged | "Payment failed. You can retry." + Retry; still logged in and locked |
| Student closes Stripe tab after paying | Webhook arrives later; reconcile job every 5 min catches missed events | Returning to `/pay` shows "We are confirming your payment", then unlocked |
| Return URL opened without payment (forged) | Status endpoint returns `processing` or `unpaid`; never unlocks | Still locked |
| Two tabs, two payments | Second marked `needs_review`; refund proposal needs approval | Normal; support follow-up |
| Stripe outage | Create session fails with `INTERNAL` + retry | "Temporarily unavailable, try again" |

Tests: T-PAY-014, T-PAY-030…039, T-E2E-02/07.

### J3 — Referred registration (REQ-CON-01)

1. Samir opens `https://app…/join/ABC123XY` (or `/register?ref=ABC123XY`).
2. Banner "You were invited by {Consultancy}" and an editable "Referred by" field.
3. If he edits or clears the field, the submitted value wins; an invalid code shows a field error and can be cleared (never traps him).
4. Optional unticked: "Share my contact details with {Consultancy}".
5. Attribution is stored in the registration transaction and **locked**; only an approved admin override changes it.
6. If he leaves and later registers without the link, he can type the code (no cookie is used).

Tests: T-CON-001…, T-AUTH-0xx referral, `RISK-CON-ATTR-LOST` accepted risk.

### J4 — Blocked account → SIM unlock (REQ-CARD-02, REQ-PART-01/02/05)

```mermaid
sequenceDiagram
  actor P as Priya
  participant W as Web
  participant M7 as M07 Partners
  participant M6 as M06 Cards
  participant AD as Admin (Fatima/Abhishek)
  participant M11 as Email
  P->>W: Open Card 1, press partner button
  W->>M7: POST /cards/blocked-account/launch → /r/{token}
  M7->>M6: startCard → In progress; click logged
  M7-->>P: 302 to partner (HTTPS, allow-listed host)
  P->>P: Opens account with the partner
  P->>W: Upload proof (JPG/PNG/PDF ≤ 8 MB)
  W->>M7: POST proof → scan, encrypt, inbox item
  AD->>M7: Approve proof (proofs:approve)
  M7->>M6: completeCard (same transaction)
  M6->>M6: Evaluate SIM rule → Available
  M6->>M11: Outbox sim_unlocked (dedupe key)
  M11-->>P: "Your SIM card is unlocked"
```

Edge: proof rejected with a reason template → student gets email, re-uploads; rule changed meanwhile (grandfathering: unlocked students never relock); admin adds Insurance card to the SIM rule later (new students must complete it, existing unlocked students unaffected).
Tests: T-PART-010…, T-CARD-010…035, T-E2E-04/05/06.

### J5 — Accommodation enquiry (REQ-ACC-01/02)

1. Priya (Card 3 Available) fills city, budget, move-in date, room type, message; ticks consent to share contact details with the agent.
2. Lead created, Card 3 In progress, notification to Roshan within 60 seconds (no student PII in the email; deep link to the portal).
3. Roshan (2FA portal, leads only) sets status Contacted → Viewing → Booked and adds a student-visible note.
4. Priya sees the status and note on Card 3; on Booked the card becomes Completed and may feed SIM rules.
5. If notification fails, retries and fallback to an admin email; alert to Super Admins (`RISK-ACC-EMAIL-FAIL`).

Tests: T-ACC-001…, T-E2E-08.

### J6 — Terms updated → re-accept (REQ-LEG-04)

1. Lena drafts new Terms, flags "requires re-acceptance"; another admin approves; publish with `effective_from`.
2. Students receive an email; from the effective date any student route returns `TERMS_REACCEPT_REQUIRED` until accepted.
3. Paid students keep entitlements; re-acceptance blocks only new actions such as starting a new checkout.
4. Priya sees a blocking screen with a diff summary, accepts, continues where she was.

Tests: T-LEG-021, T-E2E-15.

### J7 — Identity privacy controls (REQ-ID-03/04, REQ-SEC-02)

| Action | Path | Result |
|--------|------|--------|
| See what NIVO holds | Privacy centre → masked view + access log (who revealed what, when) | Transparency |
| Export | "Download my data" (step-up) → email link → login + step-up → zip | Valid 7 days |
| Delete identity data | "Delete my identity data" (step-up) → request accepted → purge within ~1 h → confirmation email | Cards already unlocked stay unlocked (latch) |
| Delete account | "Delete my account" → saga across modules; invoices kept anonymised | Confirmation email |
| Auto retention | 30 days after Card 1 Completed, hard cap 90 days; reminder email 7 days before | Student can export first |

Tests: T-ID-020…035, T-SEC-010.

### J8 — Admin publishes a change (REQ-ADM-02/03, REQ-CARD-03)

1. Content editor edits the Vodafone link or SIM rule as a draft; sees diff and "preview as student" (synthetic states).
2. For the SIM rule the impact preview shows "N students would unlock, M grandfathered".
3. Submit for review → inbox item for an approver (not the author).
4. Approver reviews diff, step-up, approves → publish (immediate or scheduled) → caches invalidated, live in ≤ 60 s.
5. Rollback publishes the previous version as a new version.

Tests: T-ADM-020…029, T-CARD-040…, T-E2E-06/09.

### J9 — Refund / manual mark-paid (REQ-PAY-05)

1. Finance admin opens the payment, presses Refund (step-up, reason) → request created, status "Waiting for another admin".
2. Operations Approver / Super Admin sees it in the inbox, reviews payload hash, approves with step-up.
3. Handler calls Stripe refund with an idempotency key; webhook `charge.refunded` closes the loop; credit note issued; entitlement revoked (access closes, card progress preserved).
4. Requester cannot approve own request (service + DB trigger); a Super Admin may use the emergency override only for allowed actions (not for refunds above policy hard floors as defined in the policy table).

Tests: T-PAY-040…, T-ADM-010…019, T-E2E-13.

### J10 — Consultancy dashboard (REQ-CON-02)

1. Carla logs in on the consultancy host with password + TOTP.
2. Sees funnel counts (registered, verified, paid, identity complete, cards, SIM unlocked), campaign filter, and rows with pseudonym ID, first name + last initial, country, intake and stage dates; email/phone only for students who consented.
3. Exports CSV (formula-safe, capped; row count audited).
4. Cannot see any other consultancy's data or any identity/payment details.

Tests: T-CON-010…, T-E2E-12.

### J11 — Admin loses authenticator (RISK-AUTH-2FA-LOST)

1. Fatima uses a recovery code (10 issued at enrolment) to sign in; the system forces re-enrolment and notifies her by email.
2. If codes are lost, a Super Admin requests `admins:reset_2fa` after an out-of-band identity check; a second Super Admin approves; the next login requires enrolment.
3. If all Super Admins are locked out, the dual-control break-glass runbook applies (`GAP-ADM-BREAKGLASS`).

Tests: T-AUTH-045…047, T-E2E-16.

### J12 — Resume on another device

Priya starts on mobile, verifies email on laptop (deep link opens the next step), logs in; "Welcome back — continue where you left off" resumes at the exact step (Pay or the identity sub-step). Draft identity data is encrypted server-side; no browser storage is used.

Tests: T-UX-001, T-ID-0xx draft save/resume.

## 4. Cross-journey rules

- One clear next step at every point; progress label `Step n of 5 · about m minutes left`.
- Every partner button shows the partner disclosure and the commission disclosure.
- Help button on every screen (`GAP-SUPPORT-CHANNEL`).
- All user-facing strings use copy-deck keys with `de.*` ready.
- Server errors map to the catalog; messages say how to fix.
- Accessibility: WCAG 2.1 AA, 44 px targets, mobile-first, reduced motion.

## 5. Journey-to-test coverage

| Journey | E2E | Other tests |
|---------|-----|-------------|
| J1 | T-E2E-01, 02, 03 | T-UX-001 |
| J2 | T-E2E-02, 07 | T-PAY-014, T-PAY-030…039 |
| J3 | T-E2E-12 (attribution part), new T-E2E in M10 | T-CON-001… |
| J4 | T-E2E-04, 05, 06 | T-PART-*, T-CARD-* |
| J5 | T-E2E-08 | T-ACC-* |
| J6 | T-E2E-15 | T-LEG-021 |
| J7 | T-E2E-11, T-E2E-10 | T-ID-*, T-SEC-010 |
| J8 | T-E2E-06, 09 | T-ADM-020…029 |
| J9 | T-E2E-13 | T-PAY-040…, T-ADM-010…019 |
| J10 | T-E2E-12 | T-CON-010 |
| J11 | T-E2E-16 | T-AUTH-04x |
| J12 | T-UX-001 | T-ID draft tests |
