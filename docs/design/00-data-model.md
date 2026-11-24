# Data Model (ERD)

PostgreSQL 16. UUIDs as primary keys. Timestamps `timestamptz` UTC. Soft-delete only where legally required; otherwise hard delete via DSR saga.

## Core entities

```
users ──┬── student_profiles ── identity_records ── identity_files
        ├── sessions
        ├── consents
        ├── payments ── invoices
        ├── card_progress ── proofs / link_clicks
        ├── accommodation_leads ── lead_notes
        ├── notify_requests
        ├── documents
        └── deletion_requests

cards (admin-defined) ── sim_unlock_rules
legal_documents (versioned)
settings / setting_drafts / setting_versions
permissions ── roles ── role_permissions ── admin_users
approval_policies ── approval_requests ── approval_decisions
audit_log (append-only, hash-chained)
consultancies ── consultancy_users
students.consultancy_id → consultancies (attribution)
```

## Sensitive fields (encrypted at rest, app-level AES-256-GCM)

`identity_records`: passport_number_enc, father_name_enc, mother_name_enc, current_address_enc, permanent_address_enc, signature_object_key (file encrypted separately).

## RLS

- Consultancy role: `USING (consultancy_id = current_setting('app.consultancy_id')::uuid)` on reporting views.
- Student: always scoped by `user_id = current_user_id()` in API; DB role for app is least privilege.
- Admin: app-layer permissions; DB role `nivo_app` cannot DROP audit_log.

## Key enums

- `payment_status`: pending | processing | paid | failed | refunded | manually_paid
- `card_status`: locked | available | in_progress | completed | coming_soon
- `lead_status`: new | contacted | viewing | booked | closed
- `proof_status`: pending | approved | rejected
- `publish_status`: draft | pending_review | approved | published | rejected
- `user_kind`: student | admin | agent | consultancy
