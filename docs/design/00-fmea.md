# Failure Mode and Effects Analysis (FMEA)

| RISK ID | Flow | Failure | Impact | Detection | Prevention | Recovery | Owner |
|---------|------|---------|--------|-----------|------------|----------|-------|
| RISK-PAY-WEBHOOK-LOST | Payment | Webhook delayed/lost | Paid but locked | Stripe dashboard + poll | Idempotent webhook; reconcile job every 5m | Poll status UI; reconcile marks paid | M04 |
| RISK-PAY-DUP-WEBHOOK | Payment | Duplicate webhook | Double side-effects | Event id unique | Upsert by stripe_event_id | No-op second time | M04 |
| RISK-PAY-WRONG-AMOUNT | Payment | Wrong amount/currency | Revenue/compliance | Server check | Verify amount=14900 EUR | Reject + alert | M04 |
| RISK-PAY-REFUND-AFTER | Payment | Refund after SIM unlocked | Business loss | Audit | Approval + warn if SIM unlocked | Manual ops | M04/M09 |
| RISK-ID-HEIC | Identity | iPhone HEIC | Upload fail | Content-type | Convert server-side | Retry as JPEG | M05 |
| RISK-ID-AV-DOWN | Identity | ClamAV down | Uploads stuck | Health check | Queue pending_scan | Process when AV up; never skip | M05 |
| RISK-ID-KEY-LOSS | Identity | Encryption key lost | Data unreadable | Key backup test | Dual key backup; rotation drills | Restore key from backup | M01/M05 |
| RISK-ID-RETENTION-SILENT | Identity | Retention job fails | Over-retention | Overdue alert | Cron + heartbeat metric | Rerun + alert | M05 |
| RISK-CARD-RELOCK | Cards | Rule change relocks active | Breaks students | — | Grandfather unlocked/in_progress/completed | N/A | M06 |
| RISK-PART-BAD-LINK | Partners | Broken partner URL | Dead end | Link health check | HTTPS + allowlist + preview | Admin alert; disable button | M07 |
| RISK-ACC-EMAIL-FAIL | Accommodation | Roshan email fails | Lead unseen | Bounce/error | Retry backoff; fallback admin email | Alert Super Admins | M08/M11 |
| RISK-CON-ATTR-LOST | Consultancy | Student browses away | Lost attribution | — | URL + editable Referred by field | Admin reassign audited | M10 |
| RISK-CON-LEAK | Consultancy | Cross-tenant read | GDPR breach | RLS tests | RLS + API scope + matrix tests | Incident response | M10 |
| RISK-AUTH-EMAIL | Auth | Verify email never arrives | Stuck | Provider metrics | Resend cooldown; change email | Support path | M02/M11 |
| RISK-AUTH-2FA-LOST | Auth | Lost authenticator | Lockout | — | Recovery codes | Admin-assisted reset audited | M02/M09 |
| RISK-AUTH-STUFFING | Auth | Credential stuffing | Takeover | Rate limit metrics | Argon2id, lockout, breach check | Force reset | M02 |
| RISK-PLAT-MIGRATE | Platform | Bad migration | Outage | CI migrate test | Expand-contract migrations | Rollback plan | M01 |
| RISK-LEGAL-ERASURE | Deletion | Erasure vs invoice law | Non-compliance | Legal review | Anonymise invoice keep minimal | Documented in Privacy Policy | M04/M05 |
