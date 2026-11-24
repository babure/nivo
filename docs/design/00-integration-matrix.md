# Module Integration Matrix

Contract types: `API` | `DB` | `Event` | `Job` | `Settings` | `None`

| From → To | M01 | M02 | M03 | M04 | M05 | M06 | M07 | M08 | M09 | M10 | M11 |
|-----------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| M01 Infra | — | DB/Sessions store | DB | DB/Secrets | Storage/Keys | DB | Storage | DB | DB/Audit store | DB/RLS | Jobs/Mail |
| M02 Auth | Uses | — | Consent on register | Gate unpaid | User id | Session for paywall | Session | Session | Admin sessions | Consultancy sessions | Welcome email |
| M03 Legal | Uses | Terms gate / reaccept | — | Checkout consent text | Identity consent | Disclosure copy | Partner disclosure | — | Legal CMS publish | Share-progress consent | Terms PDF |
| M04 Payment | Uses | Requires verified user | Immediate-start consent | — | Unlocks identity step | Opens cards 1+3 on paid | — | — | Mark-paid/refund approvals | Paid funnel metric | Receipt email + invoice |
| M05 Identity | Uses | Profile link | Consent record | Requires paid | — | Gates card 1 | — | Prefill name | Reveal/download audit | — | Export package |
| M06 Cards | Uses | Paywall uses session | — | Listens paid event | Requires identity complete | — | Status from proofs | Card 3 → acc page | Card CRUD publish | Funnel stages | SIM unlocked email |
| M07 Partners | Uses | Student id | — | — | — | Sets completed → SIM eval | — | — | Proof queue approve | — | SIM email trigger |
| M08 Acc | Uses | Prefill | — | — | — | Card 3 status | — | — | Agent role / CSV | — | Lead notify email |
| M09 Admin | Uses | Admin 2FA | Publish legal | Approvals payments | Reveal perms | Publish cards/rules | Proof approvals | Lead admin | — | Manage consultancies | — |
| M10 Consult | Uses | Register ref field | Share consent | Funnel paid | Never reads identity | Funnel stages | — | — | Created by admin | — | — |
| M11 Emails | Uses | Verify/reset mails | — | Receipt | — | SIM unlocked | — | Lead notify | — | — | — |

## Critical sequences

1. **Paid unlock:** Stripe webhook → verify sig → upsert payment paid (idempotent) → open cards 1+3 → queue invoice job → never unlock on browser return alone.
2. **Identity gate:** GET card1 → if identity incomplete → 403 IDENTITY_INCOMPLETE.
3. **SIM unlock:** proof approved / card completed → evaluate sim_unlock_rules in same TX → if met and not grandfathered-locked → set SIM available → queue email. Already unlocked/in_progress/completed never relock.
4. **Deletion saga:** request → approval if needed → purge identity files/fields, proofs, leads PII → anonymise invoices → revoke sessions → audit.
5. **Publish settings:** draft → approve → publish → bump settings version → invalidate cache → live site reads new values.
