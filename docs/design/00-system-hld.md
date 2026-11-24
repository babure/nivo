# System HLD — NIVO Student Platform

| Field | Value |
|-------|-------|
| Status | Review |
| Last updated | 2026-11-24 |

## 1. Context

NIVO UG (Berlin) is a referrer platform for international students moving to Germany. Students register, pay €149 once, complete identity details, and work through partner steps in a dashboard. Admins manage content, approvals and students. Consultancies track referred students. Accommodation agents manage leads only.

NIVO never holds partner money. Contracts are student ↔ partner.

## 2. Actors

| Actor | Access |
|-------|--------|
| Student | Public site, account, payment, identity, dashboard, documents |
| Admin (permissioned) | Admin app; actions gated by permissions + approval policies |
| Accommodation agent | Leads only |
| Consultancy user | Own referred students (pseudonymised) |
| Partner systems | Outbound tracked links; inbound webhooks/CSV (Phase 2) |
| Stripe | Checkout + webhooks |
| Email provider | Transactional mail |
| ClamAV | Upload scanning |

## 3. Components

```
Browser (web) → Caddy/Nginx (TLS, HSTS, CSP, rate limit)
                 ├─ apps/web (React SPA)
                 └─ apps/api (Fastify)
                        ├─ PostgreSQL 16 (RLS, field encryption)
                        ├─ Object storage (encrypted files)
                        ├─ Job queue (emails, retention, PDFs, reconcile)
                        ├─ Stripe
                        ├─ Email (Brevo / SES eu-central-1)
                        └─ ClamAV
```

Monorepo: `apps/web`, `apps/api`, `packages/shared`.

## 4. Trust boundaries

1. Internet → Edge (TLS termination, WAF-style limits)
2. Edge → App (internal network)
3. App → DB / Storage / Secrets (credentials, least privilege)
4. App → Stripe / Email (TLS, signed webhooks inbound)
5. Admin subdomain vs student app (separate cookie scope)

## 5. Cross-cutting concerns

- AuthN: server-side sessions (HttpOnly; Secure; SameSite=Lax) + CSRF
- AuthZ: permission registry, deny-by-default; RLS for multi-tenant (consultancy)
- Encryption: AES-256-GCM field encryption; envelope-encrypted files; keys outside DB
- Observability: structured logs with PII redaction; audit log hash-chained
- Compliance: GDPR, TDDDG, consumer law (checkout, withdrawal), BFSG accessibility
- i18n: English first; German-ready keys and `/de/...` routes

## 6. Module map

| Module | Responsibility |
|--------|----------------|
| M01 Infra | Hosting, DB, storage, backups, headers, logging |
| M02 Auth | Register, verify, login, reset, sessions, 2FA |
| M03 Legal | Legal CMS, cookies, consents, Terms re-accept |
| M04 Payment | Stripe €149, webhooks, invoices, refunds |
| M05 Identity | Encrypted identity vault, uploads, retention, DSR |
| M06 Cards | Dashboard card engine, paywall, SIM rules |
| M07 Partners | Tracked links, proofs, completion |
| M08 Accommodation | Enquiry, leads, agent workflow |
| M09 Admin | Permissions, approvals, publish, audit |
| M10 Consultancy | Referral attribution, isolated dashboard |
| M11 Emails/Docs | Templates, Documents section |

## 7. Deployment

- Staging and production on Hetzner (Germany)
- Encrypted volumes; backups encrypted off-site in DE
- CI: lint, typecheck, unit, integration, SAST, secret scan
- No real PII in staging

## 8. Decisions locked

- Stripe (not Mollie) for Phase 1 — ADR-002
- Sessions (not JWT-in-localStorage) — ADR-003
- Identity after payment — data minimisation
- SIM grandfathering on rule change
- Referral: URL + editable field, no cookie
