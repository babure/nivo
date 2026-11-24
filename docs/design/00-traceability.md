# Traceability Matrix

Maps requirements → modules → controls → tests.

| REQ ID | Statement (short) | Module(s) | CTRL IDs | Test IDs | Status |
|--------|-------------------|-----------|----------|----------|--------|
| REQ-AUTH-01 | Register with passport name, email, phone, country, intake, password | M02 | CTRL-AUTH-ARGON2, CTRL-AUTH-RATE | T-AUTH-001 | Designed |
| REQ-AUTH-02 | Email verification before dashboard | M02 | CTRL-AUTH-VERIFY | T-AUTH-010 | Designed |
| REQ-AUTH-03 | Password reset single-use short-lived | M02 | CTRL-AUTH-RESET | T-AUTH-020 | Designed |
| REQ-AUTH-04 | Session HttpOnly Secure SameSite + CSRF | M02, M01 | CTRL-AUTH-SESSION | T-AUTH-030 | Designed |
| REQ-AUTH-05 | Admin/consultancy 2FA mandatory | M02, M09, M10 | CTRL-AUTH-2FA | T-AUTH-040 | Designed |
| REQ-AUTH-06 | CSRF on cookie-authenticated mutations | M02 | CTRL-AUTH-SESSION | T-AUTH-031 | Designed |
| REQ-AUTH-07 | Login throttling / lockout | M02 | CTRL-AUTH-RATE | T-AUTH-001 | Designed |
| REQ-AUTH-08 | Enumeration-safe register/forgot responses | M02 | CTRL-AUTH-ARGON2 | T-AUTH-030 | Designed |
| REQ-AUTH-09 | Staff cannot be active without 2FA enrolled | M02, M09 | CTRL-AUTH-2FA | T-AUTH-040 | Designed |
| REQ-LEG-01 | Six legal pages versioned and editable | M03, M09 | CTRL-LEG-VERSION | T-LEG-001 | Designed |
| REQ-LEG-02 | Cookie banner three equal buttons, no non-essential before consent | M03 | CTRL-LEG-COOKIE | T-LEG-010 | Designed |
| REQ-LEG-03 | Terms acceptance saved with version + time | M02, M03 | CTRL-LEG-CONSENT | T-LEG-020 | Designed |
| REQ-LEG-04 | New Terms forces re-acceptance | M03 | CTRL-LEG-REACCEPT | T-LEG-021 | Designed |
| REQ-LEG-05 | Checkout records Terms + withdrawal acknowledgement per version | M03, M04 | CTRL-LEG-CONSENT | T-LEG-030 | Designed |
| REQ-LEG-06 | Legal publish uses draft/review/publish with prior version retained | M03, M09 | CTRL-ADM-PUBLISH | T-LEG-001 | Designed |
| REQ-PAY-01 | €149 one-time Stripe Checkout | M04 | CTRL-PAY-STRIPE | T-PAY-001 | Designed |
| REQ-PAY-02 | Unlock only on verified webhook | M04, M06 | CTRL-PAY-WEBHOOK | T-PAY-010 | Designed |
| REQ-PAY-03 | Invoice PDF email + Documents | M04, M11 | CTRL-PAY-INVOICE | T-PAY-020 | Designed |
| REQ-PAY-04 | Failure shows retry; stay locked | M04 | CTRL-PAY-RETRY | T-PAY-030 | Designed |
| REQ-PAY-05 | Admin mark-paid + refund with audit | M04, M09 | CTRL-ADM-APPROVAL | T-PAY-040 | Designed |
| REQ-PAY-06 | Amount/currency/product server-side only | M04 | CTRL-PAY-STRIPE | T-PAY-010b | Designed |
| REQ-PAY-07 | Missed/duplicate webhooks cannot lose or double unlock | M04 | CTRL-PAY-WEBHOOK | T-PAY-010 | Designed |
| REQ-PAY-08 | Duplicate/over-payment and disputes go to review queue | M04, M09 | CTRL-ADM-APPROVAL | T-PAY-040 | Designed |
| REQ-SEC-03 | Security headers (HSTS, CSP, nosniff) on all responses | M01 | CTRL-INFRA-HEADERS | T-SEC-001 | Designed |
| REQ-SEC-04 | PII redaction in application logs | M01 | CTRL-INFRA-LOG-REDACT | T-SEC-002 | Designed |
| REQ-SEC-05 | Encrypted backups + restore drill | M01 | CTRL-INFRA-BACKUP | T-SEC-001 | Designed |
| REQ-SEC-06 | Secrets outside repo (SOPS/env); no secrets in images | M01 | CTRL-INFRA-TLS | T-SEC-001 | Designed |
| REQ-ID-01 | Capture identity fields after payment | M05 | CTRL-ENC-FIELD-AES, CTRL-ID-CONSENT | T-ID-001 | Designed |
| REQ-ID-02 | Passport scan encrypted private storage | M05 | CTRL-ENC-FILE, CTRL-AV | T-ID-010 | Designed |
| REQ-ID-03 | Auto-delete per retention schedule | M05 | CTRL-ID-RETENTION | T-ID-020 | Designed |
| REQ-ID-04 | Export + deletion request | M05 | CTRL-DSR | T-ID-030 | Designed |
| REQ-ID-05 | Identity complete before card 1 opens; paid-only | M05, M06 | CTRL-CARD-PAYWALL | T-ID-001 | Designed |
| REQ-ID-06 | Masked display by default | M05 | CTRL-ENC-FIELD-AES | T-ID-001 | Designed |
| REQ-ID-07 | Admin reveal: permission + step-up + reason + audit | M05, M09 | CTRL-ADM-AUDIT | T-ID-001 | Designed |
| REQ-ID-08 | Unticked identity consent before submit | M05, M03 | CTRL-ID-CONSENT | T-ID-001 | Designed |
| REQ-ID-09 | Signature canvas PNG encrypted | M05 | CTRL-ENC-FILE | T-ID-011 | Designed |
| REQ-ID-10 | Identity deletion never changes card statuses (latch) | M05, M06 | CTRL-CARD-SIM | T-CARD-010 | Designed |
| REQ-ID-11 | Upload hygiene: magic bytes, AV, HEIC→JPEG, EXIF strip | M05 | CTRL-AV | T-ID-010 | Designed |
| REQ-CARD-01 | Four cards with status tags | M06 | CTRL-CARD-PAYWALL | T-CARD-001 | Designed |
| REQ-CARD-02 | SIM unlock when required cards Completed | M06 | CTRL-CARD-SIM | T-CARD-010 | Designed |
| REQ-CARD-03 | Flexible cards addable from admin | M06, M09 | CTRL-ADM-PUBLISH | T-CARD-020 | Designed |
| REQ-CARD-04 | Unpaid student cannot open cards by URL | M06, M02 | CTRL-CARD-PAYWALL | T-CARD-030 | Designed |
| REQ-CARD-05 | Defined status transitions; no silent backward moves | M06 | CTRL-CARD-SIM | T-CARD-010 | Designed |
| REQ-CARD-06 | Grandfathering: unlocked cards never relock on rule change | M06 | CTRL-CARD-SIM | T-ADM-SIM | Designed |
| REQ-CARD-07 | Coming-soon Notify me + one email when live | M06, M11 | CTRL-DOC-EMAIL | T-CARD-001 | Designed |
| REQ-CARD-08 | Cards 1+3 need payment and identity; identity is one-way latch | M06, M05 | CTRL-CARD-PAYWALL | T-CARD-001 | Designed |
| REQ-CARD-09 | Configurable SIM unlock rules with impact preview + approval | M06, M09 | CTRL-ADM-PUBLISH | T-CARD-020 | Designed |
| REQ-CARD-10 | SIM unlocked email queued once in unlock transaction | M06, M07, M11 | CTRL-DOC-EMAIL | T-CARD-010 | Designed |
| REQ-PART-01 | Tracked partner links + click log | M07 | CTRL-PART-TRACK | T-PART-001 | Designed |
| REQ-PART-02 | Proof upload + admin approve/reject | M07, M09 | CTRL-PART-PROOF | T-PART-010 | Designed |
| REQ-PART-03 | Append-only click log with opaque student ref | M07 | CTRL-PART-TRACK | T-PART-001 | Designed |
| REQ-PART-04 | HTTPS allow-listed link templates + maker-checker | M07, M09 | CTRL-ADM-PUBLISH | T-PART-001 | Designed |
| REQ-PART-05 | Proof approval completes card + SIM eval + email atomically | M07, M06 | CTRL-CARD-SIM | T-PART-010 | Designed |
| REQ-PART-06 | Partner automation A/B as Phase 2 stubs | M07 | CTRL-PART-TRACK | T-PART-001 | Designed |
| REQ-PART-07 | Proof files encrypted, scanned, retention-limited | M07, M05 | CTRL-ENC-FILE, CTRL-AV | T-PART-010 | Designed |
| REQ-PART-08 | Daily partner link health check + maintenance state | M07 | CTRL-PART-TRACK | T-PART-001 | Designed |
| REQ-ACC-01 | Accommodation enquiry + Roshan notify ≤1 min | M08, M11 | CTRL-ACC-NOTIFY | T-ACC-001 | Designed |
| REQ-ACC-02 | Agent limited to leads | M08, M09 | CTRL-ADM-PERM | T-ACC-010 | Designed |
| REQ-ACC-03 | In-site page; name/email prefilled | M08 | CTRL-ACC-NOTIFY | T-ACC-001 | Designed |
| REQ-ACC-04 | Lead status pipeline with audit | M08 | CTRL-ADM-AUDIT | T-ACC-010 | Designed |
| REQ-ACC-05 | Student sees enquiry status; can withdraw | M08 | CTRL-ACC-NOTIFY | T-ACC-001 | Designed |
| REQ-ACC-06 | CSV export formula-safe, approval-gated | M08, M09 | CTRL-ADM-APPROVAL | T-ACC-010 | Designed |
| REQ-ACC-07 | Notification channel abstraction (email now, WhatsApp later) | M08, M11 | CTRL-ACC-NOTIFY | T-ACC-001 | Designed |
| REQ-ACC-08 | Lead PII shared with consent; anonymise after close | M08 | CTRL-DSR | T-ACC-001 | Designed |
| REQ-ADM-01 | Permission registry + custom roles | M09 | CTRL-ADM-PERM | T-ADM-001 | Designed |
| REQ-ADM-02 | Maker-checker approval policies | M09 | CTRL-ADM-APPROVAL | T-ADM-010 | Designed |
| REQ-ADM-03 | Draft/review/publish settings | M09 | CTRL-ADM-PUBLISH | T-ADM-020 | Designed |
| REQ-ADM-04 | Tamper-evident audit log | M09 | CTRL-ADM-AUDIT | T-ADM-030 | Designed |
| REQ-ADM-05 | Step-up auth + emergency override with alert | M09 | CTRL-ADM-APPROVAL | T-ADM-040 | Designed |
| REQ-ADM-06 | Admin sessions: 2FA, short idle, separate host/cookie, CSRF | M09, M02 | CTRL-AUTH-2FA | T-ADM-050 | Designed |
| REQ-ADM-07 | Unified approvals inbox with SLA | M09 | CTRL-ADM-APPROVAL | T-ADM-060 | Designed |
| REQ-ADM-08 | Identity reveal/download: reason, limits, audit | M09, M05 | CTRL-ADM-AUDIT | T-ADM-070 | Designed |
| REQ-ADM-09 | Student support view (masked, timeline, preview) | M09 | CTRL-ADM-PERM | T-ADM-090 | Designed |
| REQ-ADM-10 | Export framework: permission, approval, caps, formula-safe | M09 | CTRL-ADM-APPROVAL | T-ADM-090 | Designed |
| REQ-ADM-11 | Reports + security alerts (override, reveal velocity, audit) | M09 | CTRL-ADM-AUDIT | T-ADM-090 | Designed |
| REQ-CON-01 | Referral link attribution | M10, M02 | CTRL-CON-ATTR | T-CON-001 | Designed |
| REQ-CON-02 | Consultancy sees only own students (RLS) | M10 | CTRL-CON-RLS | T-CON-010 | Designed |
| REQ-CON-03 | Admin creates consultancy; activation needs agreement/DPA | M10, M09 | CTRL-CON-ATTR | T-CON-050 | Designed |
| REQ-CON-04 | URL referral + editable field; locked after register | M10, M02 | CTRL-CON-ATTR | T-CON-001 | Designed |
| REQ-CON-05 | Pseudonymised funnel dashboard | M10 | CTRL-CON-RLS | T-CON-020 | Designed |
| REQ-CON-06 | Anti-fraud flags reviewed by admin | M10, M09 | CTRL-ADM-AUDIT | T-CON-030 | Designed |
| REQ-CON-07 | Formula-safe CSV of limited fields | M10 | CTRL-CON-RLS | T-CON-040 | Designed |
| REQ-CON-08 | Consultancy login + mandatory TOTP, short sessions | M10, M02 | CTRL-AUTH-2FA | T-CON-056 | Designed |
| REQ-DOC-01 | Transactional emails | M11 | CTRL-DOC-EMAIL | T-DOC-001 | Designed |
| REQ-DOC-02 | Emails: one next action, EN+DE keys, accessible, no tracking | M11 | CTRL-DOC-EMAIL | T-DOC-003 | Designed |
| REQ-DOC-03 | Documents: invoices + accepted Terms PDF, secure download | M11 | CTRL-DOC-EMAIL | T-DOC-030 | Designed |
| REQ-DOC-04 | Delivery monitoring, webhooks, resend | M11 | CTRL-DOC-EMAIL | T-DOC-016 | Designed |
| REQ-DOC-05 | No PII in job/outbox payloads beyond IDs | M11 | CTRL-INFRA-LOG-REDACT | T-DOC-021 | Designed |
| REQ-DOC-06 | Suppression + unsubscribe for coming-soon notices | M11 | CTRL-DOC-EMAIL | T-DOC-014 | Designed |
| REQ-UX-01 | Five-step onboarding stepper | M02–M06 | — | T-UX-001 | Designed |
| REQ-SEC-01 | Hosting in Germany, HTTPS, encryption | M01 | CTRL-INFRA-* | T-SEC-001 | Designed |
| REQ-SEC-02 | Account deletion request button | M05 | CTRL-DSR | T-SEC-010 | Designed |
