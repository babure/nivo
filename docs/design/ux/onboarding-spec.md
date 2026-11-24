# Onboarding UX Spec

| Field | Value |
|-------|-------|
| Status | Review |
| Principle | One clear next step at all times |

## Journey stepper (persistent)

1. Create account  
2. Verify email  
3. Pay €149  
4. Your details  
5. Your dashboard  

Progress label: `Step {n} of 5 · about {m} minutes left`. Returning users: "Welcome back — continue where you left off" → resume exact step.

## Screens

### 1. Create account (`/register?ref=CODE`)

- Fields: full name (helper: "Exactly as written in your passport"), email, phone (E.164), country, planned intake, password (12+ with strength meter), 18+ checkbox, Terms + Privacy (unticked, links open side sheet).
- If `ref`: banner "You were invited by {Consultancy}" + editable "Referred by" field.
- Optional: "Share my progress with my consultancy" unticked.
- States: loading, validation errors on blur, success → verify screen.
- A11y: labels, 44px targets, autocomplete attributes.

### 2. Verify email

- "Check your inbox" + masked email.
- Resend with countdown; "Wrong email? Change it".
- Deep link opens next step across devices.
- States: pending, expired link, already verified.

### 3. Pay

- Price €149 incl. VAT (placeholder until tax confirms).
- What it covers / does not cover (partner costs paid to partners).
- Immediate-start withdrawal tick (unticked).
- Button: "Order with obligation to pay".
- Trust: hosted in Germany, secure Stripe Checkout.
- Return: "We are confirming your payment" (poll) — never unlock on return alone.
- Failure: clear message + Retry; stay logged in and locked.

### 4. Your details (identity)

Sub-steps with save & resume: Personal → Family → Address → Passport → Signature → Review.

- Each sensitive field: "Why we ask" + "Who sees it" (NIVO admins only by default).
- Passport upload: camera/file, good-photo example, instant feedback, progress, thumbnail, replace.
- Signature: draw + typed alternative; clear/redo; consent line.
- Review: masked passport number; Edit per section; confirm consent.
- Reassurance: "Encrypted · stored in Germany · deleted automatically after [x] days".

### 5. Dashboard

- Card order with status tags; one highlighted "Next step".
- Locked cards explain why + what unlocks them.
- SIM progress indicator (e.g. 0/1).
- Help button every screen.
- Partner disclosure near buttons.

## Microcopy rules

- Short sentences; no jargon after first explanation of Sperrkonto.
- Errors say how to fix.
- All strings in `docs/product/copy-deck.md` with `de.` keys ready.

## Quality bars

- WCAG 2.1 AA; reduced-motion; mobile-first.
- Public/auth JS budget ~200KB first load.
- Usability: 5 students complete onboarding unaided before D5 (record results in `ux/usability-notes.md`).

## Low-fi prototype

Static HTML prototype at `docs/design/ux/prototype/index.html` covering the five steps for click-through review.
