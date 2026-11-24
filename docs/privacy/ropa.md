# Record of Processing Activities (RoPA) — Art. 30(1) GDPR

| Field | Value |
|-------|-------|
| Status | Review (draft for counsel) |
| Controller | NIVO UG (haftungsbeschränkt), Berlin, Germany — registered office, register court/number, managing director and contact email are placeholders until `GAP-LEG-IMPRESSUM-DATA` closes |
| Data protection officer / privacy contact | `GAP-DPO` (to be decided); interim privacy contact: privacy@ (placeholder) |
| Representative (Art. 27) | Not required (controller established in the EU) |
| Last updated | 2026-11-24 |
| Review cycle | Every 6 months and on every change in purposes, recipients, processors, retention or a new module |
| Related | `retention-schedule.md`, `processor-register.md`, `consent-spec.md`, `dpia.md`, `docs/security/toms.md`, module HLD §7 (data classification) |

NIVO is a **referrer platform**: it introduces students to partners and supports setup. Contracts for banking, SIM, accommodation, insurance are between the student and the partner. NIVO never holds partner money.

## 1. Data subjects

| Code | Data subject |
|------|-------------|
| S | Students (international students moving to Germany; 18+ only, `GAP-MINORS`) |
| A | NIVO administrators and accommodation agent (staff) |
| C | Consultancy users and consultancy contact persons (business contacts) |
| V | Visitors of the public site (anonymous) |
| P | Partner contact persons (business contacts in admin settings) |

## 2. Processing activities

| # | Activity | Module | Purpose | Data subjects | Categories of personal data | Lawful basis (Art. 6 / 9) | Recipients (internal / external) | Third-country transfer | Retention | TOMs |
|---|----------|--------|---------|---------------|-----------------------------|---------------------------|----------------------------------|------------------------|-----------|------|
| 1 | Account registration, login, verification | M02 | Create and secure the student account | S | Name as in passport, email, phone (E.164), country, intake, password hash (Argon2id), locale, session metadata (IP hash, UA family), referral reference | 6(1)(b) contract; 6(1)(f) security | NIVO staff (support, masked); Brevo (email delivery); Hetzner (hosting) | None intended (EU hosting); Brevo EU region | Account life; unverified accounts purged after 7 days; sessions 14 d idle / 30 d absolute | TOM 1–8 (`toms.md`) |
| 2 | Staff and consultancy authentication | M02, M09, M10 | Secure access to admin and consultancy areas | A, C | Name, email, password hash, TOTP secret (encrypted), recovery code hashes, session metadata, scopes | 6(1)(b), 6(1)(f) | Super Admins; Hetzner; Brevo | None | Account life + 12 months | Mandatory 2FA, step-up |
| 3 | Legal consents and cookie choices | M03 | Prove acceptance of Terms/Privacy/withdrawal info, consents for identity and sharing; cookie consent proof | S, V | User ID, consent type, document version and hash, timestamp, IP hash, UA family; for visitors random consent ID and choices (no IP) | 6(1)(c) and 6(1)(f) (accountability, Art. 7(1)); 6(1)(b) for contract terms; § 25 TDDDG | NIVO staff (legal admin); Hetzner | None | Account life + 3 years (consents); cookie evidence 3 years; `nivo_consent` cookie 6 months | Append-only ledger |
| 4 | Payment processing (€149) | M04 | Collect the one-time fee, grant access, issue invoice | S | Payment record (amount, status, Stripe session/payment/charge IDs, consent IDs), billing name, invoice number and PDF, email | 6(1)(b), 6(1)(c) tax/commercial law | Stripe Payments Europe Ltd. (processor and, for fraud/regulatory duties, independent controller); NIVO finance staff; tax advisor (invoices); Brevo (receipt email); Hetzner | Stripe may process in the US under SCCs/DPF — see processor register | Invoices and payment records 8 years after fiscal year end (`GAP-PAY-RETENTION`); Stripe event summaries 180 days | Webhook verification, no card data stored |
| 5 | Manual payment and refunds | M04, M09 | Record bank-transfer payments, issue refunds with maker-checker | S, A | Payment record, bank reference text, refund reason, approver identities | 6(1)(b), 6(1)(c) | Finance staff; Stripe | As above | 8 years | Approval + audit |
| 6 | Identity vault | M05 | Collect passport scan and number, parents' names, addresses, signature to support identity consistency for partner introductions and fraud prevention (NIVO-only by default, `GAP-IDENTITY-PURPOSE`) | S | Passport number, scan, signature image, full name, father/mother names, current/permanent address, phone, contact email; masked previews | 6(1)(a) explicit consent (with open question under Art. 7(4), alternative 6(1)(b), `GAP-ID-CONSENT-CONDITIONAL`). Passport scans may reveal special-category data only incidentally (photo); no Art. 9 purpose intended | Super Admins with `identity:reveal` (audited, reason required); ClamAV sandbox (internal); Hetzner object storage (encrypted) | None | 30 days after the Blocked Account card is Completed; hard cap 90 days after submission; drafts 30 days; deleted on request | AES-256-GCM fields, envelope-encrypted files, masked UI, access log visible to student |
| 7 | Card progress and dashboard | M06 | Provide the step-by-step dashboard and SIM unlock rules | S | Card statuses, timestamps, unlock markers, waitlist requests | 6(1)(b); 6(1)(a) for "Notify me" | Support/Ops admins (read); consultancy (aggregate or consented rows) | None | Account life; status events 24 months; waitlist rows 30 days after notification | Paywall guard, single writer |
| 8 | Partner link tracking and proofs | M07 | Send the student to the partner, log clicks as commission evidence, verify completion via uploaded proof | S | Click log (user, partner, click ID, resolved URL with opaque `public_ref`, time), proof files, student note, review decision | 6(1)(b); 6(1)(f) commission reconciliation | Ops admins (proofs); the partner receives only referral code, `public_ref`, `click_id` via URL | None (partners are independent controllers; no NIVO data sets are transferred) | Clicks 24 months; proofs 90 days after approval, 30 days after rejection | Allow-listed hosts, SecureFileService |
| 9 | Accommodation enquiries | M08 | Pass the student's accommodation request to the accommodation agent and track status | S | Contact snapshot (name, email, phone), city, budget range, move-in date, message, status, agent notes visible to student | 6(1)(b); 6(1)(a) for sharing contact details with the agent (explicit tick) | Accommodation agent (Roshan, own role, leads only); NIVO admins (leads scope) | None | 24 months after the lead is closed | Agent role scope, notification without PII |
| 10 | Consultancy referral attribution and reporting | M10 | Attribute students to the consultancy that referred them; give the consultancy limited funnel visibility | S, C | Referral code entered, URL code, source, campaign, IP-prefix HMAC (30 days), funnel row (pseudonym, first name + last initial, country, intake, stage dates); email/phone only with student consent | 6(1)(f) legitimate interest in attributing referrals (notice at registration, `GAP-CON-LAWFUL-BASIS`); 6(1)(a) for contact sharing | Consultancy users (own students only, RLS); NIVO admins | None | Life of student record; shared contacts deleted on withdrawal/reassignment/erasure | RLS, pseudonymised projection |
| 11 | Transactional email and documents | M11 | Send verification, receipts, status and security emails; provide Documents section | S, A, C | Recipient address (resolved at send time), template key, delivery status, bounce/complaint flags, invoice and Terms PDFs | 6(1)(b), 6(1)(f); legal duty to provide contract terms in durable form | Brevo (EU) as processor | None intended | Outbox rows 90 days; delivery events 90 days; documents per source (invoices 8 years) | No PII in queue payloads |
| 12 | Admin operations and audit | M09 | Accountability of admin actions, maker-checker, security monitoring | A, S (by opaque ID only) | Actor ID, role, action, target IDs, masked before/after, reason, request ID, IP prefix, device hash | 6(1)(f); 6(1)(c) for tax-relevant actions | Auditor role; Super Admins | None | 3 years; payment/refund actions 8 years (`GAP-ADM-AUDIT-RETENTION`) | Hash chain, WORM checkpoint |
| 13 | Security logs and monitoring | M01 | Detect and investigate attacks and outages | S, A, V | Redacted structured logs (requestId, route, hashed user ID, status), Caddy access logs with IP masked to /24 (v4) /48 (v6), error reports without body | 6(1)(f) | Engineering on-call; GlitchTip and Prometheus (self-hosted, DE) | None | Access logs 14 days; app logs 30 days; metrics 13 months | Redaction tests |
| 14 | Data subject requests | M05, M09 | Fulfil access, export, rectification, erasure, withdrawal | S | Request record, verification outcome, export package (temporary), completion log | 6(1)(c) | Super Admins / Ops Approver | None | Request records 3 years; export files 7 days | DSR runbook |
| 15 | Backups | M01 | Restore service after failure | S, A, C | Encrypted copies of all databases | 6(1)(f) | Hetzner (nbg1 storage); operators (no decryption keys) | None | ≤ 35 days; deleted identity data ages out; ledger replay prevents resurrection | pgBackRest AES-256 |
| 16 | Support contact | UX | Answer student questions via email/form | S | Name, email, message, attachments | 6(1)(b), 6(1)(f) | Support staff; Brevo (mail) | None | 12 months after closing (`GAP-SUPPORT-CHANNEL`) | Mailbox access control |

## 3. Special categories and high-risk markers

- No purpose depends on special-category data. Passport photos and nationality may reveal racial or ethnic origin by inference; the DPIA (`dpia.md`) treats this as high-risk processing and applies the full control set.
- Automated decision-making (Art. 22): none. Card unlock rules and fraud flags are deterministic and reviewed by humans for adverse effects.
- Children: not intended; 18+ checkbox (`GAP-MINORS`).
- Large-scale / systematic monitoring: none (no analytics at launch; click log is limited to clicks the student initiates).

## 4. Recipients and processors (summary)

See `processor-register.md` for contracts, locations and transfer tools. Independent controllers receiving data by the student's own action: **partners** (via the partner website), **consultancies** (limited funnel data, see `consultancy-data-sharing.md`), **Stripe** (for its own legal duties).

## 5. International transfers

| Transfer | Mechanism | Status |
|----------|-----------|--------|
| Stripe Payments Europe → Stripe Inc. (US) | EU–US Data Privacy Framework certification and/or SCCs per Stripe DPA | To confirm in DPA review |
| Brevo (France) → sub-processors | Per Brevo DPA; EU hosting selected | To confirm |
| Admin access from outside the EU (founders/agents in India) | Remote access to German systems by NIVO staff — treated as a transfer if personal data are viewed from a third country (Art. 44 ff.) → **SCCs / intra-group or contractor clauses and a transfer impact assessment** (`GAP-TRANSFER-STAFF`) | Open — counsel |
| Students whose own data returns to their home countries via export | Data subject's own request | N/A |

## 6. Technical and organisational measures

Referenced in `docs/security/toms.md` (Art. 32). Activity-specific controls are named in each module HLD §10 (`CTRL-*`).

## 7. Open items

| ID | Item | Owner |
|----|------|-------|
| GAP-DPO | Appoint DPO or document why not | Founders + counsel |
| GAP-TRANSFER-STAFF | Staff access from non-EU locations: contract basis and TIA | Counsel |
| GAP-CON-LAWFUL-BASIS | Confirm 6(1)(f) vs consent for consultancy funnel visibility | Counsel |
| GAP-ID-CONSENT-CONDITIONAL | Consent vs contract basis for identity data | Counsel |
| GAP-PAY-RETENTION | Statutory retention periods for invoices/payment records | Tax advisor |
| GAP-ROPA-VERSION | Version this file with each release; publish extract to supervisory authority on request | Engineering |
