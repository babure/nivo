# D5 Design Sign-off

| Field | Value |
|-------|-------|
| Date | 2026-11-24 |
| Status | Provisional freeze for implementation |

## Design phase deliverables

| Item | Path | Status |
|------|------|--------|
| ID scheme | `00-id-scheme.md` | Done |
| Traceability | `00-traceability.md` | Done |
| System HLD | `00-system-hld.md` | Done |
| Data model | `00-data-model.md` | Done |
| Integration matrix | `00-integration-matrix.md` | Done |
| Error catalog | `00-error-catalog.md` | Done |
| FMEA | `00-fmea.md` | Done |
| Gap register | `00-gap-register.md` | Done |
| Security controls | `00-security-controls.md` | Done |
| UX onboarding | `ux/onboarding-spec.md` | Done |
| Module HLD/LLD M01–M11 | `mNN-*/` | In progress / Review |
| Templates | `templates/` | Done |

## Decisions locked for build

1. Stripe for payments.
2. Server-side sessions + CSRF.
3. Identity after payment; gate card 1.
4. SIM grandfathering on rule change.
5. Referral: URL + editable field (no cookie).
6. Passport data: encrypted, NIVO-only default, retention provisional 30/90.
7. Granular admin permissions + maker-checker + publish workflow.
8. TDD: failing tests before production code.

## Sign-off

| Role | Name | Outcome | Date |
|------|------|---------|------|
| Product (CEO) | Anoop Sai Tummula | Pending | |
| Engineering | — | Provisional proceed to M0 with High gaps tracked | 2026-11-24 |
| Lawyer | — | Pending (GAP-LAWYER-TEXTS) | |
| Tax consultant | — | Pending (GAP-VAT) | |

**Rule:** Implementation of M0+ may proceed on staging using Provisional defaults. Production go-live blocked until High gaps Closed and lawyer/tax sign-off recorded.

## High gaps still blocking production

- GAP-VAT — VAT treatment of €149
- GAP-LEG-WITHDRAWAL-WAIVER — checkout withdrawal / early-performance wording
- GAP-LAWYER-TEXTS — counsel-approved legal pages
- GAP-DPA — signed processor DPAs
- GAP-ID-CONSENT-CONDITIONAL — lawful basis for identity (consent vs contract)
- GAP-ACC-AGENT-CONTROLLER — Roshan processor vs controller
- GAP-IDENTITY-PURPOSE — who receives passport data
- GAP-CON-LAWFUL-BASIS — consultancy visibility lawful basis
- GAP-DOC-INVOICE-RETENTION — invoice retention vs erasure
- GAP-DOC-RECEIPT-LEGAL — order confirmation legal content

Traceability merges: [M01–M04](980d2b4b-92b2-4171-b99c-5b0ea624e0d7), [M05–M08](91ffd844-031b-45e3-ab59-395037d38872), [M09–M11](ea36507c-f94d-46cc-a9fa-65a8272e2dd9).

**Decisions locked:** SIM = Blocked Account only; identity one-way latch; agent 2FA mandatory; Phase 1 staff model = unified `users`+`role` (not separate `admin_accounts` yet); cookie names = `__Host-nivo_{sid|admin_sid|cons_sid|agent_sid}` (+ csrf/consent).

Supporting docs pass from [complete HLD/LLD set](5fa39e57-0ba7-429d-9fdc-61ab2b9965a4) is accepted; remaining LLD wording that still assumes M09-only admin tables is superseded by the Phase 1 account-model decision above.
