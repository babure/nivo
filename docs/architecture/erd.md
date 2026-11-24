# Entity Relationship Diagram

| Field | Value |
|-------|-------|
| Status | Review |
| Owner | NIVO Platform team |
| Last updated | 2026-11-24 |
| Source | Module LLD §1 tables (`docs/design/mNN-*/lld.md`) consolidated; high-level model in `docs/design/00-data-model.md` |
| Conventions | PostgreSQL 16; UUID primary keys (UUIDv7 generated in app); `timestamptz` UTC; snake_case; money in integer cents + ISO currency; RLS enabled **and forced** on every table; append-only tables have no UPDATE/DELETE grant for `nivo_app` and a `forbid_mutation()` trigger |
| How to read | Diagrams show primary keys, foreign keys and the columns that matter for relationships. Full column lists live in the LLDs. `||--o{` = one-to-many, `||--o|` = one-to-zero-or-one |

If this file and an LLD disagree, the LLD wins; fix this file.

## 1. Domain overview

```mermaid
erDiagram
  users ||--o| student_profiles : "student only"
  users ||--o{ sessions : has
  users ||--o{ auth_tokens : has
  users ||--o| mfa_totp : has
  users ||--o{ consents : gives
  users ||--o{ payments : makes
  users ||--o| identity_records : "one live record"
  users ||--o{ card_progress : has
  users ||--o{ proofs : uploads
  users ||--o{ link_clicks : produces
  users ||--o{ accommodation_leads : raises
  users ||--o| referrals : "attributed by"
  users ||--o{ documents : owns
  users ||--o{ deletion_requests : files
  cards ||--o{ card_versions : versioned
  cards ||--o{ card_progress : tracks
  payments ||--o{ invoices : bills
  payments ||--o{ refunds : refunded_by
  referrals }o--|| consultancies : "referred by"
  partners ||--o{ partner_links : has
  permissions }o--o{ roles : role_permissions
  roles }o--o{ admin_accounts : admin_roles
  approval_requests ||--o{ approval_decisions : decided
  audit_log }o--o| admin_accounts : "actor"
```

Cross-module references to `users(id)` are real foreign keys except where erasure requires the row to survive the user (`audit_log.actor_id` and `consents` after anonymisation keep opaque IDs only; see §9).

## 2. Authentication and profile (M02)

```mermaid
erDiagram
  users {
    uuid id PK
    citext email UK
    text user_type "student | staff"
    text staff_kind "admin | accommodation_agent | consultancy"
    text status
    text password_hash "Argon2id"
    boolean mfa_enabled
    int session_epoch
    timestamptz email_verified_at
    timestamptz deleted_at
  }
  student_profiles {
    uuid user_id PK, FK
    varchar full_name
    varchar phone_e164
    char country_code
    varchar intake_term
    varchar referral_ref_raw
    varchar public_ref "opaque partner-facing id"
  }
  sessions {
    uuid id PK
    bytea token_hash UK "SHA-256"
    uuid user_id FK
    text realm "student | staff"
    text status
    timestamptz idle_expires_at
    timestamptz absolute_expires_at
    timestamptz step_up_at
  }
  auth_tokens {
    uuid id PK
    uuid user_id FK
    text purpose "email_verify | password_reset | staff_invite"
    timestamptz expires_at
    timestamptz used_at
  }
  mfa_totp {
    uuid user_id PK, FK
    bytea secret_ciphertext
    text key_id FK
    bigint last_used_step
  }
  mfa_recovery_codes {
    uuid id PK
    uuid user_id FK
    bytea code_hash
    timestamptz used_at
  }
  users ||--o| student_profiles : "user_type = student"
  users ||--o{ sessions : ""
  users ||--o{ auth_tokens : ""
  users ||--o| mfa_totp : ""
  users ||--o{ mfa_recovery_codes : ""
```

Notes: `password_hash`, tokens and TOTP secrets are never returned by any API. Phase 1 authoritative identity store is unified `users` with `role` / staff kind (`GAP-ADM-ACCOUNT-MODEL` closed for Phase 1). Separate `admin_accounts`/`admin_sessions` remain an optional hardening target before pen-test, not the first migration.

## 3. Legal and consent (M03)

```mermaid
erDiagram
  legal_documents {
    uuid id PK
    text slug UK "terms | privacy | cookies | our-role | impressum | withdrawal | consent texts"
    text kind "page | consent_text"
  }
  legal_document_versions {
    uuid id PK
    uuid document_id FK
    text locale
    int version_no
    text status "draft | in_review | approved | scheduled | published | superseded"
    text content_hash
    boolean reaccept_required
    timestamptz effective_from
    uuid supersedes_version_id FK
    uuid approval_request_id FK
  }
  legal_document_state {
    uuid document_id PK, FK
    uuid current_version_id FK
    uuid min_required_version_id FK
  }
  legal_variables {
    text key PK
    text value
  }
  consents {
    uuid id PK
    uuid user_id FK
    text consent_type
    text action "granted | withdrawn"
    uuid document_version_id FK
    bytea ip_hash
    timestamptz created_at "append-only"
  }
  user_legal_state {
    uuid user_id PK, FK
    uuid terms_version_id FK
    uuid privacy_version_id FK
  }
  cookie_definitions {
    uuid id PK
    text name
    text category
    boolean active
  }
  cookie_consent_events {
    uuid id PK
    uuid consent_id "random, in cookie"
    uuid user_id "optional"
    jsonb choices
    int banner_version
  }
  legal_notifications {
    uuid id PK
    uuid version_id FK
    uuid user_id FK
  }
  legal_settings {
    uuid id PK
    int banner_version
  }
  legal_documents ||--o{ legal_document_versions : ""
  legal_documents ||--|| legal_document_state : ""
  legal_document_versions ||--o{ consents : "accepted version"
  users ||--o{ consents : ""
  users ||--|| user_legal_state : ""
  legal_document_versions ||--o{ legal_notifications : ""
```

## 4. Payment (M04)

```mermaid
erDiagram
  payment_price_versions {
    uuid id PK
    int amount_cents "14900"
    text currency "EUR"
    text tax_mode
    timestamptz valid_from
    uuid approval_request_id FK
  }
  payments {
    uuid id PK
    uuid user_id FK
    text status "pending | processing | paid | failed | cancelled | refunded | manually_paid | needs_review"
    uuid price_version_id FK
    text stripe_checkout_session_id UK
    text stripe_payment_intent_id
    uuid terms_consent_id FK
    uuid withdrawal_consent_id FK
    timestamptz paid_at
  }
  stripe_events {
    text id PK "evt_..."
    uuid payment_id FK
    text type
    timestamptz processed_at
  }
  payment_status_history {
    uuid id PK
    uuid payment_id FK
    text from_status
    text to_status
    uuid actor_user_id
  }
  entitlements {
    uuid id PK
    uuid user_id FK
    uuid source_payment_id FK
    uuid revoked_by_refund_id FK
    timestamptz granted_at
    timestamptz revoked_at
  }
  invoices {
    uuid id PK
    text number UK "gapless"
    uuid user_id FK
    uuid payment_id FK
    uuid refund_id FK "credit notes"
    uuid related_invoice_id FK
    text pdf_key
  }
  invoice_counters {
    int year PK
    int last_number
  }
  refunds {
    uuid id PK
    uuid payment_id FK
    text stripe_refund_id
    text status
    uuid approval_request_id FK
  }
  manual_payment_requests {
    uuid id PK
    uuid user_id FK
    uuid applied_payment_id FK
    uuid approval_request_id FK
  }
  payment_reviews {
    uuid id PK
    uuid payment_id FK
    text stripe_event_id
    text reason "needs_review queue"
  }
  reconciliation_runs {
    uuid id PK
    timestamptz started_at
    int mismatches
  }
  users ||--o{ payments : ""
  payment_price_versions ||--o{ payments : "snapshot"
  payments ||--o{ stripe_events : ""
  payments ||--o{ payment_status_history : ""
  payments ||--o| entitlements : "grants"
  payments ||--o{ invoices : ""
  payments ||--o{ refunds : ""
  refunds ||--o| invoices : "credit note"
  manual_payment_requests ||--o| payments : "applied as"
  payments ||--o{ payment_reviews : ""
```

Partial unique index: at most one `paid`/`manually_paid` payment per user; a second paid session becomes `needs_review` with a refund proposal.

## 5. Identity vault (M05)

```mermaid
erDiagram
  identity_records {
    uuid id PK
    uuid user_id FK
    text status "draft | complete | deleting | deleted"
    bytea full_name_enc
    bytea passport_number_enc
    bytea father_name_enc
    bytea mother_name_enc
    bytea current_address_enc
    bytea permanent_address_enc
    uuid passport_scan_file_id FK
    uuid signature_file_id FK
    uuid consent_id FK
    timestamptz completed_at
    timestamptz anchor_completed_at
    timestamptz delete_after
  }
  identity_keys {
    uuid record_id PK, FK
    uuid user_id
    bytea wrapped_dek
    smallint kek_version
  }
  secure_files {
    uuid id PK
    text owner_module "identity | proof"
    uuid owner_user_id FK
    text purpose
    text status "pending_scan | scanning | clean | rejected | deleted"
    text final_key
    bytea wrapped_dek
  }
  identity_access_log {
    uuid id PK
    uuid subject_user_id
    uuid actor_user_id
    text action
    text reason_code
    uuid request_id
  }
  identity_exports {
    uuid id PK
    uuid user_id FK
    text status
    timestamptz expires_at
  }
  deletion_requests {
    uuid id PK
    uuid user_id FK
    text scope "identity | account"
    text kind "deletion | consent_withdrawal"
    text status
  }
  deletion_ledger {
    uuid id PK
    uuid record_id
    uuid user_id
    timestamptz deleted_at "off-DB copy used for restore replay"
  }
  users ||--o| identity_records : "one live record"
  identity_records ||--|| identity_keys : "DEK per record"
  identity_records }o--o| secure_files : "scan, signature"
  users ||--o{ secure_files : owns
  users ||--o{ identity_exports : ""
  users ||--o{ deletion_requests : ""
  users ||--o{ identity_access_log : "subject"
  identity_records ||--o{ deletion_ledger : ""
```

Tombstone rule: `status = 'deleted'` rows hold no personal data (CHECK constraint).

## 6. Cards (M06), partners and proofs (M07)

```mermaid
erDiagram
  cards {
    uuid id PK
    text slug UK
    int sort_order
    uuid published_version_id FK
    timestamptz archived_at
  }
  card_versions {
    uuid id PK
    uuid card_id FK
    int version
    text publish_status
    text card_type "partner | accommodation | info | coming_soon"
    text completion_mode "proof_review | lead_booked | admin_manual"
    uuid partner_id FK
    boolean requires_identity
    boolean identity_retention_anchor
    jsonb title_i18n
    jsonb body_i18n
  }
  card_unlock_rules {
    uuid id PK
    uuid card_id FK
    int version
    text publish_status
    jsonb rule "mode, requiredCardIds, min"
  }
  card_progress {
    uuid user_id PK, FK
    uuid card_id PK, FK
    text status "locked | available | in_progress | completed"
    text lock_reason
    timestamptz unlocked_at "grandfather marker"
    timestamptz completed_at
    int version
  }
  card_status_events {
    bigint id PK
    uuid user_id
    uuid card_id
    text cause
    text actor_kind
  }
  student_milestones {
    uuid user_id PK, FK
    timestamptz paid_at
    timestamptz identity_completed_at
  }
  notify_requests {
    uuid id PK
    uuid user_id FK
    uuid card_id FK
    timestamptz notified_at
  }
  partners {
    uuid id PK
    text key UK
    text name
    boolean active
  }
  partner_links {
    uuid id PK
    uuid partner_id FK
    text url_template
    text publish_status
    uuid approval_request_id FK
  }
  partner_link_health_checks {
    uuid id PK
    uuid link_id FK
    int http_status
  }
  link_clicks {
    uuid id PK
    uuid user_id FK "nullable after erasure"
    uuid partner_id FK
    uuid card_id FK
    uuid link_id FK
    text click_id UK
    boolean is_duplicate
    timestamptz clicked_at "append-only"
  }
  proofs {
    uuid id PK
    uuid user_id FK
    uuid card_id FK
    uuid partner_id FK
    text status "draft | pending | approved | rejected | withdrawn"
    timestamptz decided_at
  }
  proof_files {
    uuid proof_id FK
    uuid file_id FK "secure_files"
    text content_sha256
  }
  cards ||--o{ card_versions : ""
  cards ||--o{ card_unlock_rules : ""
  cards ||--o{ card_progress : ""
  users ||--o{ card_progress : ""
  users ||--|| student_milestones : ""
  users ||--o{ notify_requests : ""
  cards ||--o{ notify_requests : ""
  partners ||--o{ card_versions : "partner cards"
  partners ||--o{ partner_links : ""
  partner_links ||--o{ partner_link_health_checks : ""
  partner_links ||--o{ link_clicks : ""
  users ||--o{ link_clicks : ""
  users ||--o{ proofs : ""
  proofs ||--o{ proof_files : ""
  proof_files }o--|| secure_files : ""
  card_progress ||--o{ card_status_events : "history"
```

## 7. Accommodation (M08)

```mermaid
erDiagram
  accommodation_leads {
    uuid id PK
    uuid user_id FK
    text status "new | contacted | viewing | booked | closed"
    uuid agent_id FK
    uuid consent_id FK "contact sharing consent"
    text city
    date move_in_date
    timestamptz closed_at
    timestamptz delete_after
  }
  lead_notes {
    uuid id PK
    uuid lead_id FK
    uuid author_id FK
    text visibility "internal | student"
  }
  lead_status_events {
    uuid id PK
    uuid lead_id FK
    text from_status
    text to_status
    uuid actor_id
  }
  lead_notifications {
    uuid id PK
    uuid lead_id FK
    text channel
    timestamptz sent_at
    text provider_message_id
  }
  accommodation_export_requests {
    uuid id PK
    uuid approval_request_id FK
  }
  users ||--o{ accommodation_leads : "partial unique: one open lead"
  accommodation_leads ||--o{ lead_notes : ""
  accommodation_leads ||--o{ lead_status_events : ""
  accommodation_leads ||--o{ lead_notifications : ""
```

## 8. Admin control plane (M09)

```mermaid
erDiagram
  admin_accounts {
    uuid id PK
    citext email UK
    text status
    text password_hash
    uuid totp_key_id
  }
  admin_sessions {
    uuid id PK
    uuid admin_id FK
    timestamptz step_up_at
  }
  admin_recovery_codes {
    uuid id PK
    uuid admin_id FK
    timestamptz used_at
  }
  roles {
    uuid id PK
    text key UK
    boolean is_system
    boolean exclusive
  }
  permissions {
    text key PK "domain:action"
    text sensitivity "L | M | H | C"
    boolean step_up
    text approval_action
  }
  role_permissions {
    uuid role_id FK
    text permission_key FK
  }
  admin_roles {
    uuid admin_id FK
    uuid role_id FK
    jsonb scope "countries | lead_type | consultancy_ids"
    uuid approval_request_id FK
  }
  approval_policies {
    text action_key PK
    boolean required
    int approver_count
    text[] approver_roles
    interval expiry
  }
  approval_requests {
    uuid id PK
    text action_key
    uuid requester_id FK
    text status "pending | approved | rejected | expired | cancelled | executing | executed | failed"
    jsonb payload "IDs and parameters, no PII"
    bytea payload_hash
    jsonb policy_snapshot
  }
  approval_decisions {
    uuid id PK
    uuid request_id FK
    uuid approver_id FK "trigger: not requester"
    text decision
    bytea payload_hash
  }
  inbox_items {
    uuid id PK
    text item_type "proof | approval | dsr | fraud | ..."
    uuid assignee_id FK
    uuid requester_admin_id FK
  }
  content_entities {
    uuid id PK
    text content_type "card | partner_link | text | sim_rule | contact | legal"
    uuid live_version_id FK
  }
  content_versions {
    uuid id PK
    uuid entity_id FK
    int version_no
    text status
    jsonb payload
    uuid base_version_id FK
    uuid change_set_id FK
    uuid approval_request_id FK
  }
  change_sets {
    uuid id PK
    uuid approval_request_id FK
  }
  audit_log {
    bigint id PK
    uuid chain_id
    uuid actor_id
    text action
    text target_type
    uuid target_id
    jsonb before_masked
    jsonb after_masked
    bytea prev_hash
    bytea hash "HMAC-SHA256 chain"
  }
  audit_checkpoints {
    uuid id PK
    bigint seq_to
    bytea last_hash
    text object_key "object-locked bucket"
  }
  export_jobs {
    uuid id PK
    text export_type
    uuid approval_request_id FK
    timestamptz expires_at
  }
  admin_alerts {
    uuid id PK
    text severity
    uuid subject_admin_id FK
  }
  student_notes {
    uuid id PK
    uuid student_id FK
    uuid author_id FK
  }
  preview_sessions {
    uuid id PK
    uuid student_id FK
    uuid admin_id FK
  }
  link_domain_allowlist {
    uuid id PK
    text domain
  }
  reject_reason_templates {
    text code PK
  }
  system_settings {
    text key PK
    jsonb value
  }
  admin_accounts ||--o{ admin_sessions : ""
  admin_accounts ||--o{ admin_recovery_codes : ""
  roles ||--o{ role_permissions : ""
  permissions ||--o{ role_permissions : ""
  admin_accounts ||--o{ admin_roles : ""
  roles ||--o{ admin_roles : ""
  approval_policies ||--o{ approval_requests : "snapshot at create"
  approval_requests ||--o{ approval_decisions : ""
  admin_accounts ||--o{ approval_requests : "requester"
  content_entities ||--o{ content_versions : ""
  change_sets ||--o{ content_versions : "atomic publish"
  approval_requests ||--o{ content_versions : ""
  audit_checkpoints ||--o{ audit_log : "covers range"
  users ||--o{ student_notes : "about student"
```

`audit_log` holds opaque IDs only (no names, emails, identity values) so it never needs erasure. It has no foreign key to `users`.

## 9. Consultancy (M10)

```mermaid
erDiagram
  consultancies {
    uuid id PK
    text name
    text referral_code UK
    text status "active | suspended | pending"
    date agreement_date
    date dpa_date
  }
  consultancy_users {
    uuid id PK
    uuid consultancy_id FK
    citext email
    text role
  }
  consultancy_sessions {
    uuid id PK
    uuid consultancy_user_id FK
  }
  referrals {
    uuid id PK
    uuid student_id FK "nullable after erasure"
    uuid consultancy_id FK
    text source "url | field | admin_override | none"
    text url_code
    text field_code
    boolean share_consent
    bytea ip_prefix_hmac
  }
  referral_changes {
    uuid id PK
    uuid referral_id FK
    uuid approval_request_id FK
  }
  referral_funnel {
    uuid id PK
    uuid referral_id FK
    uuid consultancy_id FK "RLS key"
    text pseudonym_id UK "S-XXXXXXXXXX"
    uuid student_id "system only; not selectable by consultancy role"
    text display_name "first name + last initial"
    timestamptz paid_at
  }
  referral_shared_contacts {
    uuid referral_id PK, FK
    uuid consultancy_id FK
    bytea email_enc
    bytea phone_enc
  }
  referral_flags {
    uuid id PK
    uuid inbox_item_id FK
    text kind
  }
  referral_dedupe_keys {
    uuid id PK
    uuid referral_id FK
    bytea key_hmac
  }
  referral_event_log {
    uuid event_id PK "idempotent projection"
  }
  consultancies ||--o{ consultancy_users : ""
  consultancy_users ||--o{ consultancy_sessions : ""
  consultancies ||--o{ referrals : "referred by"
  users ||--o| referrals : ""
  referrals ||--o{ referral_changes : ""
  referrals ||--|| referral_funnel : "projection"
  referrals ||--o| referral_shared_contacts : "only while consent granted"
  referrals ||--o{ referral_dedupe_keys : ""
```

Consultancy DB role can read only column-limited views of `referral_funnel` and `referral_shared_contacts` filtered by `consultancy_id`; it has no grants on student, identity, payment or card tables (T-CON-010).

## 10. Email and documents (M11)

```mermaid
erDiagram
  email_outbox {
    uuid id PK
    text template_key
    uuid recipient_id "user, resolved at send time"
    text dedupe_key UK
    jsonb payload "IDs only"
    text status "queued | sending | sent | delivered | bounced | complained | failed | suppressed"
    text provider_message_id
  }
  email_delivery_events {
    uuid id PK
    uuid outbox_id FK
    text provider_event_id UK
    text event_type
  }
  email_suppressions {
    uuid id PK
    text address_hash
    uuid source_outbox_id FK
    text reason
  }
  email_templates {
    text key PK
    int version
    text locales
  }
  documents {
    uuid id PK
    uuid student_id FK
    text kind "invoice | credit_note | terms | export"
    text key "object storage key"
    uuid key_id
    text sha256
  }
  email_outbox ||--o{ email_delivery_events : ""
  email_outbox ||--o{ email_suppressions : "bounce source"
  users ||--o{ documents : ""
  invoices ||--o| documents : "registered as"
```

## 11. Platform (M01)

| Table | Purpose | Keys |
|-------|---------|------|
| `rate_limit_buckets` | Sliding-window counters, key is an HMAC (never raw email/IP) | PK `key` |
| `idempotency_keys` | Client `Idempotency-Key` replay protection | UNIQUE (`scope`, `key`) |
| `encryption_key_registry` | KEK metadata (no key material), one `active` per purpose | PK `key_id` |
| `ops_backup_runs`, `ops_restore_drills` | Backup and restore evidence | PK `id` |
| `pgboss.*` | Job queues and DLQs (payloads carry IDs only) | managed by pg-boss |

## 12. Table catalogue

| Module | Tables | Append-only / immutable | Personal data class | Erasure behaviour |
|--------|--------|-------------------------|---------------------|-------------------|
| M01 | rate_limit_buckets, idempotency_keys, encryption_key_registry, ops_backup_runs, ops_restore_drills | — | Internal (hashed keys) | Purged by TTL |
| M02 | users, student_profiles, sessions, auth_tokens, mfa_totp, mfa_recovery_codes | — | Personal | Account deletion saga nulls/deletes; `deleted_at` tombstone for the email uniqueness window |
| M03 | legal_documents, legal_document_versions, legal_document_state, legal_variables, legal_settings, cookie_definitions | Published versions immutable | Public | Kept |
| M03 | consents, user_legal_state, legal_notifications, cookie_consent_events | `consents`, `cookie_consent_events` append-only | Personal / pseudonymous | Consents anonymised after account life + 3 years (evidence); cookie events 36 months |
| M04 | payments, payment_status_history, stripe_events, entitlements, invoices, invoice_counters, refunds, manual_payment_requests, payment_reviews, reconciliation_runs, payment_price_versions | `invoices`, `payment_status_history`, `stripe_events` | Personal (financial) | Retained 8 years, restricted; recipient name anonymised on erasure |
| M05 | identity_records, identity_keys, secure_files, identity_access_log, identity_exports, deletion_requests, deletion_ledger | `identity_access_log`, `deletion_ledger` | Sensitive | Crypto-shred DEK, delete ciphertext and files, tombstone |
| M06 | cards, card_versions, card_unlock_rules, card_progress, card_status_events, student_milestones, notify_requests | `card_status_events`; `card_progress` regression trigger | Personal (low) | Deleted with account; aggregates retained without IDs |
| M07 | partners, partner_links, partner_link_health_checks, link_clicks, proofs, proof_files | `link_clicks` | Personal / sensitive-adjacent (proof files) | Clicks: `user_id` set NULL; proofs deleted |
| M08 | accommodation_leads, lead_notes, lead_status_events, lead_notifications, accommodation_export_requests | `lead_status_events` | Personal | Contact snapshot deleted; closed leads anonymised |
| M09 | admin_accounts, admin_sessions, admin_recovery_codes, roles, permissions, role_permissions, admin_roles, approval_policies, approval_requests, approval_decisions, inbox_items, content_entities, content_versions, change_sets, audit_log, audit_checkpoints, export_jobs, admin_alerts, student_notes, preview_sessions, link_domain_allowlist, reject_reason_templates, system_settings | `audit_log`, `approval_decisions` | Internal (staff personal data); audit holds IDs only | Staff anonymised 12 months after disable; student notes deleted in erasure saga |
| M10 | consultancies, consultancy_users, consultancy_sessions, referrals, referral_changes, referral_funnel, referral_shared_contacts, referral_flags, referral_dedupe_keys, referral_event_log | `referral_event_log` | Personal (pseudonymous) | Funnel row PII nulled, shared contacts deleted, student link removed |
| M11 | email_outbox, email_delivery_events, email_suppressions, email_templates, documents | `email_delivery_events` | Personal | Outbox payloads purged at 90 days; documents per source rule |

## 13. Naming reconciliation with `00-data-model.md`

| `00-data-model.md` | Implemented as | Reason |
|--------------------|----------------|--------|
| `identity_files` | `secure_files` (`owner_module = identity | proof`) | Shared encrypted upload pipeline for M05 and M07 |
| `sim_unlock_rules` | `card_unlock_rules` | Any card can have a rule; SIM is the first consumer |
| `settings`, `setting_drafts`, `setting_versions` | `content_entities` + `content_versions` + `system_settings` | One generic versioned content store for cards, links, texts, rules, contact, legal drafts |
| `students` / `users` | `users` (+ `student_profiles`); staff in `users` (M02) and/or `admin_accounts` (M09) | See §2 note |
| `lead_status` enum values | `new | contacted | viewing | booked | closed` | As in data model; prototype code uses a different list and must migrate |
| `payment_status` enum | M04 adds `cancelled` and `needs_review` | Failure and review states |
| `link_clicks`, `proofs` | Same names; `proof_status` gains `draft`, `withdrawn` | M07 workflow |
| `users` per-student `consultancy_id` | `referrals.consultancy_id` | Attribution is a locked, auditable record |

## 14. Integrity rules that the schema enforces

1. One live identity record per user (partial unique index); tombstones carry no personal data (CHECK).
2. One paid payment per user (partial unique index); one live card version and rule per card.
3. `card_progress` cannot regress without an approved override (trigger); `unlocked_at`/`completed_at` cannot be cleared.
4. `approval_decisions.approver_id <> approval_requests.requester_id` (trigger) and decisions bound to the payload hash.
5. `audit_log`, `consents`, `link_clicks`, `identity_access_log` are append-only for the runtime role; the last active Super Admin cannot be removed (trigger).
6. Staff accounts cannot be `active` without `mfa_enabled` (CHECK).
7. Consultancy role reads only `consultancy_id`-filtered views (RLS + column-limited views).
8. Every table has RLS enabled and forced (T-INFRA-013).
