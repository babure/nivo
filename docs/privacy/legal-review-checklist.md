# Legal and Privacy Review Checklist (counsel hand-off)

| Field | Value |
|-------|-------|
| Status | Review |
| Owner | Product (CEO) → external lawyer, tax consultant, privacy counsel |
| Last updated | 2026-11-24 |
| Gate | Production go-live is blocked until every **High** item is `Closed`, or `Provisional` with a named owner and date (D5 rule, `docs/design/00-gap-register.md`). Staging may proceed on provisional defaults |
| How to use | Counsel works top to bottom; each row gets a decision, a date and a pointer to the updated text or setting. Engineering updates the design/test IDs afterwards |

Status values: `Open`, `In review`, `Closed`, `Provisional (owner, date)`.

## 1. Legal pages (M03, `REQ-LEG-01`)

| # | Item | Needed | Severity | Linked | Status |
|---|------|--------|----------|--------|--------|
| 1.1 | Terms and Conditions (EN; German AGB) — service description, €149 fee, what it covers and excludes (partner costs paid to partners), referrer role, liability, termination, governing law, consumer withdrawal link | Final text per language | High | `GAP-LEG-COUNSEL`, `GAP-LAWYER-TEXTS` | Open |
| 1.2 | Privacy Policy (Art. 13/14): controller, DPO, purposes and bases per `ropa.md`, recipients per `processor-register.md`, transfers, retention per `retention-schedule.md`, rights, complaint authority, automated decisions (none), consent withdrawal, consultancy section, identity vault section | Final text | High | `GAP-LAWYER-TEXTS` | Open |
| 1.3 | Impressum (DDG § 5): company, address, register court/number, managing director, VAT ID, contact | Company data | Medium | `GAP-LEG-IMPRESSUM-DATA` | Open |
| 1.4 | Cookie Policy matches `cookie-inventory.md` | Review | Medium | `cookie-inventory.md` | Open |
| 1.5 | "Our role" page (referrer, not bank/insurer/adviser; no custody of money) | Wording | Medium | copy `role.referrer` | Open |
| 1.6 | Withdrawal information (Widerrufsbelehrung) and model form; early-performance waiver mechanics for digital services (§ 356(5) BGB) or alternative refund policy | Decision + text | High | `GAP-LEG-WITHDRAWAL-WAIVER`, `GAP-REFUND` | Open |
| 1.7 | German translations and who signs them off | Sign-off | Medium | `GAP-LEG-DE-TEXTS` | Open |
| 1.8 | Re-acceptance rule: which changes require re-acceptance; notice period | Policy | Low | M03 | Open |
| 1.9 | Wording lint list (banned phrases such as "we advise", "best insurance") | List | Low | `GAP-ADM-WORDING-LINT` | Open |

## 2. Checkout and consumer law (M04, `REQ-PAY-*`, `REQ-LEG-05`)

| # | Item | Needed | Severity | Linked | Status |
|---|------|--------|----------|--------|--------|
| 2.1 | Button label "Order with obligation to pay" (§ 312j(3) BGB) and order summary content | Confirm | High | copy `pay.button` | Open |
| 2.2 | Price display: €149 gross incl. statutory VAT; price indication rules | Confirm | High | `GAP-VAT` | Open |
| 2.3 | Express consent to immediate performance + acknowledgement of loss of withdrawal right (text, unticked checkboxes, evidence stored) | Final text | High | `GAP-LEG-WITHDRAWAL-WAIVER` | Open |
| 2.4 | Contract terms in durable form (Terms PDF + invoice attached to receipt email) | Confirm approach | Medium | M11 | Open |
| 2.5 | Refund policy, refund after SIM unlock/voucher, partial refunds, chargebacks | Policy | Medium | `GAP-REFUND`, `GAP-ADM-REFUND-AFTER-SIM`, `GAP-CARD-REFUND-ACCESS` | Open |
| 2.6 | Payment services: no custody of partner money; confirm no licence needed | Confirm | Medium | system HLD | Open |
| 2.7 | Dispute and complaints process (EU ODR is discontinued; VSBG information duty) | Statement | Low | Terms | Open |
| 2.8 | Student under 18 / minors | Policy (18+ checkbox only) | High | `GAP-MINORS` | Provisional (counsel, before launch) |

## 3. Tax (M04 invoices) — tax consultant

| # | Item | Needed | Severity | Linked | Status |
|---|------|--------|----------|--------|--------|
| 3.1 | VAT treatment of the €149 service for EU and non-EU students (place of supply for electronic/B2C services, OSS, rates) | Decision | High | `GAP-VAT`, `GAP-PAY-VAT` | Open |
| 3.2 | Invoice type: small-amount invoice (< €250) fields vs full invoice; name of buyer; invoice numbering | Decision | Medium | M04 | Open |
| 3.3 | Retention periods of invoices and payment records; credit notes for refunds | Confirm 8 years | Medium | `GAP-PAY-RETENTION` | Open |
| 3.4 | Erasure vs invoice retention (anonymise recipient name where possible) | Confirm | High | `GAP-DELETION-VS-INVOICE` | Provisional |
| 3.5 | Commission income from partners and consultancy payouts (Phase 2) | Defer | Low | `GAP-CONSULTANCY-COMMISSION` | Deferred |

## 4. Identity data (M05) — privacy counsel

| # | Item | Needed | Severity | Linked | Status |
|---|------|--------|----------|--------|--------|
| 4.1 | Purpose and recipients of passport data (NIVO only vs partners) and necessity | Decision | High | `GAP-IDENTITY-PURPOSE` | Open |
| 4.2 | Lawful basis: consent vs contract; consent freely given when the dashboard depends on it (Art. 7(4)) | Decision | High | `GAP-ID-CONSENT-CONDITIONAL` | Open |
| 4.3 | Retention: 30 days after Blocked Account Completed, 90-day hard cap, drafts 30 days | Confirm | High | `GAP-IDENTITY-RETENTION` | Provisional |
| 4.4 | DPIA (Art. 35) completion and sign-off; prior consultation need | Review | High | `dpia.md` | Draft |
| 4.5 | Backups up to 35 days and ledger replay described in the privacy policy | Wording | Medium | `GAP-ID-BACKUP-RESURRECT` | Open |
| 4.6 | Admin reveal reason codes and the need for a second approver | Decision | Medium | `GAP-ID-ADMIN-REVEAL-APPROVAL`, `GAP-ADM-REVEAL-REASONS` | Open |
| 4.7 | Hard cap reached while Card 1 in progress: no re-collection prompt | Confirm | Medium | `GAP-ID-HARDCAP-INFLIGHT` | Open |
| 4.8 | Consent text versions (identity-processing) | Final text | High | M03 consent texts | Open |

## 5. Consultancies and partners (M07, M10)

| # | Item | Needed | Severity | Linked | Status |
|---|------|--------|----------|--------|--------|
| 5.1 | Consultancy agreement template with data-sharing clauses, international transfer mechanism | Draft | High | `consultancy-data-sharing.md` | Open |
| 5.2 | Visibility of first name + last initial and stage without consent | Decision | Medium | `GAP-CONSULTANCY-VISIBILITY`, `GAP-CON-LAWFUL-BASIS` | Provisional |
| 5.3 | Partner agreements: referral, commission, no personal data processing by NIVO for partners; Phase 2 data return clause | Review | Medium | `GAP-PARTNER-LINKS` | Pending partners |
| 5.4 | Commission disclosure copy `commission.disclosure` | Confirm | Medium | copy deck | Open |
| 5.5 | Vodafone voucher terms | Hidden until confirmed | Low | `GAP-VOUCHER` | Open |
| 5.6 | Accommodation agent relationship (employee/contractor/agency) and contract/DPA | Confirm | Medium | `GAP-ROSHAN` | Open |
| 5.7 | Accommodation: disclaimer of agency role, no guarantee of housing | Wording | Low | M08 | Open |

## 6. Processors, transfers and organisation

| # | Item | Needed | Severity | Linked | Status |
|---|------|--------|----------|--------|--------|
| 6.1 | DPAs signed: Hetzner, Stripe, Brevo (or SES), DNS provider | Signed copies | High | `processor-register.md` | Open |
| 6.2 | Transfer mechanism for Stripe, remote admin access from outside the EU, consultancies outside the EU | Memo | High | `GAP-TRANSFER-STAFF`, `GAP-CON-TRANSFER` | Open |
| 6.3 | DPO appointment decision | Memo | Medium | `GAP-DPO` | Open |
| 6.4 | RoPA review | Review | Medium | `ropa.md` | Draft |
| 6.5 | Breach notification procedure and authority contact | Review | Medium | `incident-response.md` | Draft |
| 6.6 | DSR process and response templates | Review | Medium | `dsr-runbook.md` | Draft |
| 6.7 | Staff confidentiality undertakings (admins, agent) | Template | Medium | M09 | Open |
| 6.8 | Employee/contractor monitoring through the audit log (works council irrelevant; transparency to staff) | Notice | Low | M09 | Open |

## 7. Accessibility and other duties

| # | Item | Needed | Severity | Linked | Status |
|---|------|--------|----------|--------|--------|
| 7.1 | BFSG (accessibility act) applicability to the e-commerce service; accessibility statement | Confirm | Medium | WCAG 2.1 AA targets | Open |
| 7.2 | Sanctions / blocked-country policy for registration | Decision | Medium | `GAP-AUTH-COUNTRY-LIST` | Open |
| 7.3 | Email: transactional vs marketing boundary; unsubscribe not required for transactional | Confirm | Low | M11 | Open |
| 7.4 | Support channel content and retention | Decision | Medium | `GAP-SUPPORT-CHANNEL` | Open |
| 7.5 | Security.txt and vulnerability disclosure wording | Review | Low | `incident-response.md` | Open |

## 8. Sign-off

| Role | Name | Scope | Outcome | Date |
|------|------|-------|---------|------|
| Lawyer | — | Sections 1, 2, 5, 6, 7 | Pending | |
| Tax consultant | — | Section 3 | Pending | |
| Privacy counsel / DPO | — | Sections 4, 6 | Pending | |
| Product (CEO) Anoop Sai Tummula | — | Business decisions | Pending | |
| Engineering | — | Implementation of decisions; update of gap register and traceability | Pending | |

After sign-off: update `00-gap-register.md` (status `Closed`), `d5-signoff.md`, module HLD §12 tables and the affected tests.
