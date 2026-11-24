# Cookie and Browser Storage Inventory

| Field | Value |
|-------|-------|
| Status | Review |
| Owner | Engineering (technical facts) with counsel (classification) |
| Last updated | 2026-11-24 |
| Legal frame | § 25 TDDDG (storing/reading information on the user's device needs consent unless strictly necessary for a service the user requested), Art. 6 GDPR, Art. 7 (proof) |
| Source of truth in code | Cookie registry table `cookie_definitions` (M03 LLD), seeded from this file; CI test `T-LEG-011` loads each page with "Reject all" and fails if any storage item appears that is not marked necessary |
| Related | `consent-spec.md`, M03 HLD/LLD (banner, registry, evidence), M02 LLD §2.1 (session cookies) |

## 1. Principles

1. **No non-essential cookies or storage exist at launch.** The banner is shown anyway (product requirement REQ-LEG-02, `GAP-LEG-BANNER-NECESSARY-ONLY`) with three equal buttons: Accept all / Reject non-essential / Settings.
2. No third-party scripts on NIVO pages (CSP `script-src 'self'; connect-src 'self'; frame-src 'none'`). Stripe Checkout is a full-page redirect to Stripe's domain; Stripe's own cookies live on `stripe.com` and are governed by Stripe's notice.
3. No `localStorage` / `sessionStorage` / IndexedDB for tokens, personal data or tracking. CSRF token lives in memory only. Referral attribution travels in the URL and an editable form field — **no cookie** (decision locked, M10).
4. Anything new needs: row in this table, registry entry, banner category, privacy policy update, and counsel sign-off.

## 2. Cookies set by NIVO

| Name | Host | Category | Purpose | Set by | Type / flags | Lifetime | Personal data | Legal basis | Consent needed |
|------|------|----------|---------|--------|--------------|----------|---------------|-------------|----------------|
| `__Host-nivo_sid` | `app.` | Necessary | Student session identifier (random 32 bytes; server stores SHA-256 only) | M02 | HttpOnly; Secure; SameSite=Lax; Path=/; no Domain | Session cookie; persistent login ≤ 30 days absolute, 7 days idle | Pseudonymous identifier | § 25(2) Nr. 2 TDDDG (strictly necessary to provide the requested login); Art. 6(1)(b) | No |
| `__Host-nivo_admin_sid` | `admin.` | Necessary | Admin session identifier (random 32 bytes; server stores SHA-256 only) | M09 (primitives from M02) | HttpOnly; Secure; SameSite=Strict; Path=/ | Session cookie; 15 min idle / 8 h absolute | Pseudonymous identifier | § 25(2) Nr. 2 TDDDG; Art. 6(1)(b), (f) | No |
| `__Host-nivo_cons_sid` | `consultancy.` | Necessary | Consultancy user session identifier | M10 (primitives from M02) | HttpOnly; Secure; SameSite=Strict; Path=/ | Session cookie; 30 min idle / 12 h absolute | Pseudonymous identifier | § 25(2) Nr. 2 TDDDG; Art. 6(1)(b), (f) | No |
| `__Host-nivo_csrf` | all app hosts | Necessary | CSRF double-submit secret; pairs with `X-CSRF-Token` header | M02 | HttpOnly; Secure; SameSite=Lax; Path=/ | Session | Random value | § 25(2) Nr. 2; Art. 6(1)(f) security | No |
| `__Host-nivo_consent` | all app hosts | Necessary | Remembers the visitor's cookie choice and banner version so the banner is not repeated; contains random consent ID and per-category choices (no personal data) | M03 (JS-set) | Secure; SameSite=Lax; Path=/; not HttpOnly (the SPA must read it) | 6 months (re-ask after 6 months or when banner/registry version changes) | Pseudonymous consent ID | § 25(2) Nr. 2 (storing the user's decision); Art. 6(1)(c)/(f), Art. 7(1) proof | No |
| `nivo_lang` *(optional, registered as Preferences, off until used)* | all app hosts | Preferences (needs consent) | Remember language choice. **Not set at launch**: language is derived from the URL (`/de/...`) and `Accept-Language`, so no storage is needed | — | — | — | — | — | Yes, if ever used |

Notes

- **Canonical session cookie names** (`GAP-COOKIE-NAME-SYNC` closed): student `__Host-nivo_sid`, admin `__Host-nivo_admin_sid`, consultancy `__Host-nivo_cons_sid`, accommodation agent `__Host-nivo_agent_sid`, plus `__Host-nivo_csrf` and `__Host-nivo_consent`. Shared `__Host-nivo_staff_sid` is deprecated. Phase 1 keeps identities in unified `users`+`role` (`GAP-ADM-ACCOUNT-MODEL`); cookie/host separation still applies when `admin.` / `consultancy.` hosts ship. Local/dev may use a single `nivo_session` cookie until those hosts exist. Test T-INFRA-035 asserts the production list.
- `__Host-` prefix requires `Secure`, `Path=/` and no `Domain`, so cookies are not shared between `app.`, `admin.` and `consultancy.` hosts. Student cookies are never sent to the admin host.
- The "pending MFA" and "pending MFA enrolment" states use the same session cookie; no extra cookie exists.

## 3. Browser storage

| Store | Used? | Detail |
|-------|-------|--------|
| `localStorage` | No | Lint rule forbids `localStorage` in `apps/web` except in a test allow-list; T-AUTH-037 asserts it is empty after login |
| `sessionStorage` | No | Same |
| IndexedDB / Cache API | No | No service worker at launch (offline banner is static) |
| In-memory (JS variables / router state) | Yes | CSRF token, onboarding form state, the referral code carried from `/register?ref=CODE` inside the SPA session (lost on full reload — mitigated by the editable "Referred by" field) |
| HTML5 `<form>` autofill | Browser feature | `autocomplete` attributes set; not NIVO storage |

## 4. Third-party requests

| Destination | When | Cookies / storage | Basis |
|-------------|------|-------------------|-------|
| `checkout.stripe.com` | After the student clicks "Order with obligation to pay" (top-level navigation) | Stripe's own cookies, governed by Stripe's notice and necessary for fraud prevention/payment | Contract; link to Stripe privacy notice shown on the payment page |
| Partner sites | After the student clicks a partner button (top-level navigation via `/r/{token}`) | Partner's cookies, governed by the partner's notice | Disclosure copy `partner.disclosure` next to the button |
| Fonts, images, scripts | Self-hosted only | None | CSP |
| Email links | Open our host | Same as above | — |

## 5. Optional / future categories

| Category | Candidate | Status | Preconditions |
|----------|-----------|--------|---------------|
| Statistics | Plausible EU (cookieless) | Not enabled (`GAP-ANALYTICS`) | Counsel decides whether § 25 TDDDG applies to cookieless measurement; if consent needed, load through `loadAfterConsent('statistics', …)` only; CSP change via ADR; processor register and privacy policy updated |
| Marketing | None | Not planned | — |
| Preferences | `nivo_lang` | Reserved | See above |

## 6. Banner behaviour (summary of REQ-LEG-02 / REQ-LEG-06)

- First visit: banner with three equal buttons (same size, weight, colour contrast), no pre-ticked boxes, no dark patterns; keyboard and screen-reader accessible.
- "Reject non-essential" = same as "Accept necessary only": only the rows above are used.
- Footer link "Cookie settings" reopens preferences; withdrawal is as easy as consent.
- Evidence: random consent ID, choices, banner version, registry revision, time, UA family; **no IP**; kept 36 months.
- Playwright check T-LEG-011: after Reject, zero third-party requests, cookie jar contains only inventory necessary cookies, storage empty.

## 7. Review

| Trigger | Action |
|---------|--------|
| Any new cookie, storage item, script or iframe | Update inventory + registry + banner + privacy policy before merge |
| Every release | CI cookie assertion (T-LEG-011, T-INFRA-031, T-INFRA-035) |
| Every 6 months | Counsel review of classification |
