# NIVO ID Scheme

Stable identifiers used across HLD, LLD, tests, security matrix, and gap register.

## Prefixes

| Prefix | Meaning | Example |
|--------|---------|---------|
| `REQ-` | Product / brief requirement | `REQ-PAY-03` |
| `RISK-` | Threat or failure mode | `RISK-PAY-WEBHOOK-LOST` |
| `CTRL-` | Security or privacy control | `CTRL-ENC-FIELD-AES` |
| `GAP-` | Incomplete or undecided design | `GAP-IDENTITY-PURPOSE` |
| `T-` | Test case | `T-PAY-014` |
| `ADR-` | Architecture decision record | `ADR-001-STACK` |
| `M` | Module | `M04` |

## Requirement domains

| Domain | Codes |
|--------|-------|
| Auth | `REQ-AUTH-*` |
| Legal / consent | `REQ-LEG-*` |
| Payment | `REQ-PAY-*` |
| Identity | `REQ-ID-*` |
| Cards / dashboard | `REQ-CARD-*` |
| Partners / proofs | `REQ-PART-*` |
| Accommodation | `REQ-ACC-*` |
| Admin | `REQ-ADM-*` |
| Consultancy | `REQ-CON-*` |
| Emails / documents | `REQ-DOC-*` |
| Security / privacy | `REQ-SEC-*` |
| UX / onboarding | `REQ-UX-*` |

## Rules

1. IDs are immutable once published in a frozen design.
2. Every `REQ-*` maps to at least one module and one `T-*`.
3. Every sensitive asset maps to at least one `CTRL-*` and one `RISK-*`.
4. Open `GAP-*` items block D5 sign-off if severity is High.
