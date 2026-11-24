# Security Controls Traceability

| Asset | Threat (STRIDE) | Edge | Frontend | API | DB | Storage | Jobs/Logs | CI/Ops | CTRL ID | Module | Test |
|-------|-----------------|------|----------|-----|-----|---------|-----------|--------|---------|--------|------|
| Credentials | Spoofing | TLS | No localStorage secrets | Argon2id, rate limit | Hash only | — | Redact | Secret scan | CTRL-AUTH-ARGON2 | M02 | T-AUTH-001 |
| Sessions | Tampering | Secure cookies | CSRF token | Session rotate | Server sessions | — | — | — | CTRL-AUTH-SESSION | M02 | T-AUTH-030 |
| Passport number | Info disclosure | — | Masked | Field encrypt; reveal perm | Encrypted cols | — | Never log | — | CTRL-ENC-FIELD-AES | M05 | T-ID-001 |
| Passport scan | Info disclosure | Size limit | Client resize | Magic bytes, AV | — | Envelope encrypt private bucket | Quarantine | — | CTRL-ENC-FILE / CTRL-AV | M05 | T-ID-010 |
| Signature | Info disclosure | — | Canvas only | File encrypt | — | Private | — | — | CTRL-ENC-FILE | M05 | T-ID-011 |
| Addresses / parents | Info disclosure | — | Masked | Field encrypt | Encrypted | — | Never log | — | CTRL-ENC-FIELD-AES | M05 | T-ID-002 |
| Payment records | Tampering | — | — | Webhook sig verify | Amount check | — | Idempotent events | — | CTRL-PAY-WEBHOOK | M04 | T-PAY-010 |
| Partner clicks | Repudiation | — | — | Click log | Append | — | — | — | CTRL-PART-TRACK | M07 | T-PART-001 |
| Accommodation leads | Elevation | — | Hide UI | Permission + scope | Agent role | — | Audit | — | CTRL-ADM-PERM | M08 | T-ACC-010 |
| Consultancy reports | Elevation / leak | — | Scoped UI | consultancy_id check | RLS | — | Pseudonymised export | Matrix test | CTRL-CON-RLS | M10 | T-CON-010 |
| Admin actions | Elevation / repudiation | Admin cookie scope | Step-up UX | Permissions + maker-checker | Audit hash chain | — | Alerts | — | CTRL-ADM-APPROVAL / CTRL-ADM-AUDIT | M09 | T-ADM-010 |
| Legal consents | Repudiation | — | Unticked boxes | Version + IP hash | Immutable consent rows | — | — | — | CTRL-LEG-CONSENT | M03 | T-LEG-020 |
| Card access | Elevation | — | Route guards | Paywall middleware | — | — | — | E2E | CTRL-CARD-PAYWALL | M06 | T-CARD-030 |
| Exports | Info disclosure | — | — | Permission + approval | Formula-safe CSV | — | Audit | — | CTRL-ADM-APPROVAL | M09 | T-ADM-040 |

Any blank cell for a Sensitive asset is a design gap — none remain for launch-critical assets above.
