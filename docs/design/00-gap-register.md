# Gap Register

| ID | Description | Module | Severity | Owner | Decision / default | Status |
|----|-------------|--------|----------|-------|--------------------|--------|
| GAP-IDENTITY-PURPOSE | Who needs passport data (NIVO / partners) | M05 | High | Product + Lawyer | Default: NIVO only, not shared | Open — blocks DPIA final |
| GAP-IDENTITY-RETENTION | Exact retention days | M05 | High | Lawyer | 30d after card1 Completed, hard cap 90d | Provisional |
| GAP-LAWYER-TEXTS | Privacy, Impressum, Withdrawal, DE AGB | M03 | High | Lawyer | Use drafts + placeholders | Open — blocks go-live |
| GAP-VAT | VAT treatment on €149 | M04 | High | Tax consultant | Show incl. VAT placeholder | Open |
| GAP-REFUND | Refund policy wording | M04 | Medium | Product + Lawyer | Admin refund with approval | Open |
| GAP-VOUCHER | Vodafone voucher terms | M06/M07 | Low | Product | Hidden until confirmed | Open |
| GAP-PARTNER-LINKS | Expatrio/Vodafone/Swarajya params | M07 | Medium | Anoop | Admin-editable templates | Pending partners |
| GAP-ROSHAN | Contact details + photo | M08 | Medium | Anoop | Placeholder settings | Pending |
| GAP-CONSULTANCY-COMMISSION | Commission/payout rules | M10 | Low | Product | Phase 2 | Deferred |
| GAP-CONSULTANCY-VISIBILITY | Exact fields consultancy sees | M10 | Medium | Product + Lawyer | Pseudonymised + optional share consent | Provisional |
| GAP-MINORS | Can under-18 register? | M02 | High | Lawyer | 18+ checkbox only | Provisional |
| GAP-SUPPORT-CHANNEL | Help button / ticket flow | UX | Medium | Product | Mailto + form stub | Open |
| GAP-DELETION-VS-INVOICE | Erasure vs tax invoice retention | M05/M04 | High | Lawyer | Anonymise invoice, purge PII | Provisional |
| GAP-ANALYTICS | Which analytics tool | M03 | Low | Eng | Plausible EU, consent-gated | Provisional |
| GAP-EMAIL-PROVIDER | Brevo vs SES | M11 | Low | Eng | Brevo EU default | Provisional |
| GAP-WHATSAPP | Roshan WhatsApp notify | M08 | Low | Product | Email only Phase 1 | Deferred |
| GAP-LEG-WITHDRAWAL-WAIVER | Checkout early-performance / withdrawal waiver wording | M03, M04 | High | Lawyer | Immediate-start checkbox + placeholder copy | Open — blocks D5 / go-live |
| GAP-DPA | Signed DPAs with Hetzner, Stripe, email (and analytics) | M01, M04, M11 | High | Ops + Lawyer | Processor register drafted | Open — blocks go-live |
| GAP-AUTH-TOKEN-MODEL | Design prefers HMAC tokens; code stores hashed single-use tokens | M02 | Low | Eng | Keep hashed tokens (working + tested); revisit if MAC model required | Accepted for Phase 1 |
| GAP-TRACE-M01–M04 | Derived REQs / error codes not yet in matrices | Design | Low | Eng | Merged into `00-traceability.md` and `00-error-catalog.md` | Closed |
| GAP-TRACE-M05–M08 | Derived REQs from identity/cards/partners/accommodation HLDs | Design | Low | Eng | Merged into `00-traceability.md`; CTRL-ENC-FIELD → CTRL-ENC-FIELD-AES | Closed |
| GAP-ID-CONSENT-CONDITIONAL | Identity required to proceed may undermine Art. 6(1)(a) consent | M05 | High | Lawyer | Prefer evaluate Art. 6(1)(b) contract vs consent; keep unticked acknowledgement UX | Open — blocks DPIA |
| GAP-ID-RELOCK-ON-DELETE | Identity deleted → do cards relock? | M05, M06 | Medium | Product | **Decided:** one-way latch — never relock (matches plan) | Closed |
| GAP-CARD-SIM-DEFAULT | Default SIM required cards | M06 | Medium | Product | **Decided Phase 1:** Blocked Account only (code + brief); insurance later | Closed |
| GAP-ACC-AGENT-CONTROLLER | Is Roshan processor or independent controller? | M08 | High | Lawyer | Default draft: independent controller + agent agreement | Open — blocks go-live |
| GAP-ACC-COMPLETE-TRIGGER | When does Card 3 become Completed? | M08 | Medium | Product | Provisional: agent marks Booked | Provisional |
| GAP-ACC-AGENT-2FA | Mandatory 2FA for accommodation agent | M08, M02 | Medium | Security | **Decided:** mandatory (same as admin/consultancy) | Closed |
| GAP-ID-UPLOAD-MSG | UPLOAD_REJECTED should mention HEIC | M05 | Low | Eng | Catalog message updated | Closed |
| GAP-ACC-STATUS-ENUM | Design uses Viewing/Booked; code uses qualified/voucher_sent/lost | M08 | Low | Eng | Reconcile enums before Postgres migration | Open |
| GAP-ADM-ACCOUNT-MODEL | Separate `admin_accounts` (M09) vs staff rows in `users` (M02/code) | M09, M02 | High | Eng | **Phase 1 decided:** keep unified `users`+`role` (implemented); separate admin host/cookie when subdomain ships; revisit full table split pre-pen-test if needed. Note: some HLDs still describe M09-only stores — treat as target architecture, not Phase 1 schema | Closed for Phase 1 |
| GAP-COOKIE-NAME-SYNC | Conflicting cookie names across M02/M03/M09/M10 (`staff_sid` vs `admin_sid` / `cons_sid`) | M02, M03, M09, M10 | Low | Eng | **Canonical:** `__Host-nivo_sid` (student), `__Host-nivo_admin_sid` (admin), `__Host-nivo_cons_sid` (consultancy), `__Host-nivo_agent_sid` (accommodation agent), `__Host-nivo_csrf`, `__Host-nivo_consent`. Deprecate shared `__Host-nivo_staff_sid`. Local/dev may use `nivo_session` until hosts exist | Closed |
| GAP-ADM-TRACE-SYNC | Sync REQ-ADM-05..11 and admin error codes into shared registers | M09 | Low | Eng | Merged | Closed |
| GAP-ADM-KEY-ALIGNMENT | M03–M08 permission name aliases vs colon registry | M09 | Medium | Eng | Canonical = `permissions.md` / `@nivo/shared`; update LLDs incrementally | Open |
| GAP-ADM-ADAPTER-ALIGNMENT | Content publish should go through M09 ContentWorkflow | M09 | Medium | Eng | Approvals in M09; module version tables remain | Open |
| GAP-CON-LAWFUL-BASIS | Lawful basis for consultancy seeing referred students | M10 | High | Lawyer | Referral necessity + optional share-progress consent | Open — blocks go-live |
| GAP-DOC-INVOICE-RETENTION | Invoice layout + fiscal retention vs erasure | M11, M04 | High | Tax + Lawyer | Anonymised invoice keep; years TBD | Open — blocks go-live |
| GAP-DOC-RECEIPT-LEGAL | Order confirmation / durable medium content | M11 | High | Lawyer | Placeholder until counsel drafts | Open — blocks go-live |
| GAP-DOC-TEMPLATE-ALIGNMENT | Template key names across M02–M08 vs M11 catalogue | M11 | Medium | Eng | Prefer M11 producer names when wiring mailer | Open |
| GAP-TRACE-M09–M11 | CON/DOC REQs and remaining error codes | Design | Low | Eng | Merged into traceability + error catalog | Closed |

**D5 rule:** All High gaps must be Closed or Provisional-with-owner before implementation of affected module ships to production. Staging may proceed with Provisional defaults.
