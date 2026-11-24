# NIVO admin permission registry

| Field | Value |
|-------|-------|
| Module | M09 Admin |
| Status | Review |
| Source of truth in code | `packages/shared/src/permissions.ts` (mirrored into table `permissions` by a boot check; see `lld.md` §1) |
| Companion documents | `hld.md`, `lld.md` |
| Controls | `CTRL-ADM-PERM`, `CTRL-ADM-APPROVAL`, `CTRL-ADM-STEPUP`, `CTRL-ADM-EMERGENCY` |
| Requirements | `REQ-ADM-01`, `REQ-ADM-02`, `REQ-ADM-05` |
| Last updated | 2026-11-24 |

This file is normative. Every admin route declares exactly one permission from this registry (or `public`/`session`), and CI fails when a route does not (`T-ADM-002`).

## 1. Rules

1. **Deny by default.** An admin can do only what an assigned role grants. There are no wildcards and no "admin = everything" flag. Super Admin is a system role whose permission list is generated from the registry at build time (`T-ADM-003`); wildcard keys are rejected (`T-ADM-004`).
2. **Key format.** `area:action` or `area:subarea:action`, lower-case, matching `^[a-z_]+(:[a-z_]+){1,2}$`. A released key is never renamed or repurposed; it can only be deprecated (§6).
3. **Sensitivity.** `L` low (read-only, no personal data), `M` medium (personal data in context or reversible change), `H` high (publishes to students, exposes data in volume, or administers access), `C` critical (money, identity plaintext, legal effect, access control, bulk data).
4. **Step-up.** Every `H` and `C` permission requires a step-up (password or TOTP) within the last 300 s (`admin.step_up_window_seconds`, bounds 60–600). `L` and `M` never require it. There are no exceptions; `T-ADM-040` tests every `H`/`C` route.
5. **Approval policies.** A permission with a policy key in the "Approval policy" column creates an approval request instead of executing when the policy is `required` (§4). The requester can never decide their own request (database trigger `trg_forbid_self_approval`). Holding a permission never implies the right to approve; approving needs `approvals:decide` **and** a role listed in the policy's approver roles.
6. **Scopes.** A role assignment may carry a scope (§5). Scopes narrow data, never widen permissions. A request outside the caller's scope returns `NOT_FOUND`, not `FORBIDDEN`.
7. **Escalation guard.** Nobody can create a role or assignment containing a permission they do not hold themselves. Nobody edits their own role assignments (`trg_admin_roles_guard`).
8. **Reasons.** Actions marked "reason" in the Allows column need a reason of at least 10 characters (20 for emergency override). The reason is stored in the audit log.
9. **Separate principals.** Consultancy portal users (M10) and the accommodation agent session (M08) are **not** admins. They have their own DB roles and sessions. The system roles `consultancy_manager` and `accommodation_agent` below are NIVO-side roles: the former administers consultancies from the admin app, the latter is how the agent's narrow permissions are expressed in the registry for the M08 agent portal. Consultancy portal users hold no registry permission at all.
10. **No impersonation.** No permission exists, or may be added, to log in as a student. `students:view_as` renders a read-only, server-built dashboard DTO (`lld.md` §2.5) and is audited with a reason.
11. **Super Admin is not unconstrained.** Super Admin still needs a second approver for every policy that is `required`, except through the audited emergency override (`approvals:emergency_override`, where the policy allows it).

Role columns used below: **SA** super_admin · **OA** operations_approver · **SU** support · **FI** finance · **CL** content_legal_editor · **AA** accommodation_agent · **CM** consultancy_manager · **AU** auditor. `✓` = granted, `s` = granted with a scope on assignment (§5), `—` = not granted.

## 2. Registry

### 2.1 Students and support

| Permission | Allows | Sens. | Step-up | Approval policy | Scopes | SA | OA | SU | FI | CL | AA | CM | AU |
|------------|--------|:---:|:---:|-----------------|--------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `students:read` | Search by exact email, student UUID or pseudonym id; student detail, timeline, consents, referral, card progress, payment status | M | No | — | `countries` | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — |
| `students:notes:read` | Read internal support notes on a student | M | No | — | `countries` | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| `students:notes:write` | Add a note (append-only, no edit) | M | No | — | `countries` | ✓ | ✓ | ✓ | — | — | — | — | — |
| `students:resend_email` | Resend `auth_verify_email` or `welcome` to the student's current address (5 min cooldown) | M | No | — | `countries` | ✓ | ✓ | ✓ | — | — | — | — | — |
| `students:view_as` | Open a read-only rendering of what a student sees; reason code and text required | H | Yes | — | `countries` | ✓ | ✓ | ✓ | — | — | — | — | — |
| `students:mark_paid` | Request recording a bank-transfer payment for an unpaid student (reference, date, amount equal to active price) | C | Yes | `payments.mark_paid` | `countries` | ✓ | — | — | ✓ | — | — | — | — |

### 2.2 Payments and finance

| Permission | Allows | Sens. | Step-up | Approval policy | Scopes | SA | OA | SU | FI | CL | AA | CM | AU |
|------------|--------|:---:|:---:|-----------------|--------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `payments:read` | Payment list and detail (status, amount, refunds, invoice numbers); no card data exists in NIVO | M | No | — | `countries` | ✓ | ✓ | — | ✓ | — | — | — | ✓ |
| `payments:refund` | Request a full or partial refund through Stripe with revoke-access choice; reason | C | Yes | `payments.refund` | `countries` | ✓ | — | — | ✓ | — | — | — | — |
| `payments:review` | Resolve payment review items (amount mismatch, duplicate, dispute, live-mode alert) | H | Yes | — | — | ✓ | ✓ | — | ✓ | — | — | — | — |

### 2.3 Identity and proofs

| Permission | Allows | Sens. | Step-up | Approval policy | Scopes | SA | OA | SU | FI | CL | AA | CM | AU |
|------------|--------|:---:|:---:|-----------------|--------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `identity:view_masked` | See masked identity fields (first 1–3 characters, never full) and whether files exist | M | No | — | `countries` | ✓ | ✓ | ✓ | — | — | — | — | — |
| `identity:reveal` | Reveal chosen plaintext fields for one student for 60 s; reason code and text; 5 per 10 min and 20 per day per admin (shared with file download) | C | Yes | — | `countries` | ✓ | ✓ | — | — | — | — | — | — |
| `identity:download_file` | Single-use 60 s signed URL for one identity scan; reason; shares the reveal counter | C | Yes | — | `countries` | ✓ | ✓ | — | — | — | — | — | — |
| `identity:bulk_access` | Request reveal or download for more than the velocity limit or for many students (compliance request, incident) | C | Yes | `identity.bulk_access` | `countries` | ✓ | — | — | — | — | — | — | — |
| `identity:purge` | Request early purge of a student's identity data outside the automatic schedule | C | Yes | `identity.purge` | — | ✓ | — | — | — | — | — | — | — |
| `proofs:read` | Proof queue and metadata (status, age, duplicate flag, student reference) | M | No | — | `countries` | ✓ | ✓ | ✓ | — | — | — | — | — |
| `proofs:view_files` | View a proof file through a 60 s signed URL; audit row written before the URL is issued | H | Yes | — | `countries` | ✓ | ✓ | ✓ | — | — | — | — | — |
| `proofs:approve` | Approve a proof (completes the card and may unlock SIM); single and bulk (≤ 25) | H | Yes | `proofs.approve` (off by default) | `countries` | ✓ | ✓ | — | — | — | — | — | — |
| `proofs:reject` | Reject a proof with a reason template and optional note | M | No | — | `countries` | ✓ | ✓ | — | — | — | — | — | — |

### 2.4 Cards, content and settings

| Permission | Allows | Sens. | Step-up | Approval policy | Scopes | SA | OA | SU | FI | CL | AA | CM | AU |
|------------|--------|:---:|:---:|-----------------|--------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `cards:read` | View cards, versions, unlock rules, waitlist counts | L | No | — | — | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ |
| `cards:create` | Create a new card entity (slug plus first draft) | M | No | — | — | ✓ | — | — | — | ✓ | — | — | — |
| `cards:edit` | Create and edit card drafts, submit for review, withdraw | M | No | — | — | ✓ | — | — | — | ✓ | — | — | — |
| `cards:reorder` | Change card order (live immediately, audited, previous order restorable) | M | No | — | — | ✓ | — | — | — | ✓ | — | — | — |
| `cards:publish` | Publish, schedule, roll back or archive a card version | H | Yes | `content.publish.card` | — | ✓ | ✓ | — | — | — | — | — | — |
| `cards:override` | Request a manual status override of one student's card (reason, evidence) | C | Yes | `cards.override` | `countries` | ✓ | ✓ | — | — | — | — | — | — |
| `settings:read` | View settings areas: texts, links, SIM rules, contact blocks, allow-list, reject reasons | L | No | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ |
| `settings:texts:edit` | Edit helper texts, labels and notices as drafts | M | No | — | — | ✓ | — | — | — | ✓ | — | — | — |
| `settings:texts:publish` | Publish or roll back texts | H | Yes | `content.publish.text` (off by default) | — | ✓ | ✓ | — | — | ✓ | — | — | — |
| `settings:links:edit` | Edit partner link templates (Expatrio, Vodafone, Swarajya) as drafts; HTTPS allow-list enforced | M | No | — | — | ✓ | — | — | — | ✓ | — | — | — |
| `settings:links:publish` | Publish, roll back, disable or enable a partner link | H | Yes | `content.publish.partner_link` | — | ✓ | ✓ | — | — | — | — | — | — |
| `settings:sim_rules:edit` | Edit SIM unlock rule drafts and run the impact preview | M | No | — | — | ✓ | ✓ | — | — | — | — | — | — |
| `settings:sim_rules:publish` | Publish or roll back a SIM rule after impact acknowledgement | C | Yes | `content.publish.sim_rule` | — | ✓ | ✓ | — | — | — | — | — | — |
| `settings:contact:edit` | Edit the accommodation agent contact block, notification recipients and support contact as drafts | M | No | — | — | ✓ | ✓ | — | — | ✓ | — | — | — |
| `settings:contact:publish` | Publish or roll back contact blocks (changes where lead notifications go) | H | Yes | `content.publish.contact_block` | — | ✓ | ✓ | — | — | — | — | — | — |
| `settings:link_allowlist:edit` | Add or remove allowed partner hostnames (HTTPS only, IDNA, optional subdomains) | C | Yes | `settings.allowlist.update` | — | ✓ | — | — | — | — | — | — | — |
| `settings:reject_reasons:edit` | Edit proof and deletion reject-reason templates | M | No | — | — | ✓ | ✓ | — | — | — | — | — | — |
| `settings:admin_security:edit` | Change idle timeout, step-up window, session cap, global IP allow-list within hard bounds | C | Yes | `settings.admin_security.update` | — | ✓ | — | — | — | — | — | — | — |

### 2.5 Legal

| Permission | Allows | Sens. | Step-up | Approval policy | Scopes | SA | OA | SU | FI | CL | AA | CM | AU |
|------------|--------|:---:|:---:|-----------------|--------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `legal:read` | View legal documents, versions, diffs, consent statistics | L | No | — | — | ✓ | ✓ | — | — | ✓ | — | — | ✓ |
| `legal:edit` | Create and edit legal drafts, preview, submit, recall, discard | M | No | — | — | ✓ | — | — | — | ✓ | — | — | — |
| `legal:publish` | Publish a legal version (Terms, Privacy, Impressum, Withdrawal); re-accept and notify options | C | Yes | `content.publish.legal` | — | ✓ | ✓ | — | — | — | — | — | — |
| `legal:variables:edit` | Change legal variables (company name, address, contacts) used in all documents; reason | H | Yes | — | — | ✓ | — | — | — | ✓ | — | — | — |
| `legal:cookies:publish` | Publish the cookie registry; optionally bump the banner version and re-prompt all visitors | H | Yes | `legal.cookies.publish` | — | ✓ | ✓ | — | — | — | — | — | — |
| `legal:consents:read` | Read one student's consent ledger; reason required and logged | M | No | — | `countries` | ✓ | ✓ | — | — | — | — | — | — |

### 2.6 Leads and partners

| Permission | Allows | Sens. | Step-up | Approval policy | Scopes | SA | OA | SU | FI | CL | AA | CM | AU |
|------------|--------|:---:|:---:|-----------------|--------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `leads:read` | Read accommodation leads; contact data masked in lists, full on detail. Agent assignment uses scope `assigned_only` | M | No | — | `lead_type`, `assigned_only` | ✓ | ✓ | ✓ | — | — | s | — | — |
| `leads:update_status` | Move a lead through the agent status flow | M | No | — | `lead_type`, `assigned_only` | — | — | — | — | — | s | — | — |
| `leads:note` | Add internal notes to a lead (never visible to students) | M | No | — | `lead_type`, `assigned_only` | ✓ | ✓ | — | — | — | s | — | — |
| `leads:assign` | Assign or reassign a lead to an agent | M | No | — | `lead_type` | ✓ | ✓ | — | — | — | — | — | — |
| `leads:correct` | Correct a lead status outside the normal flow (backward moves, closed leads); reason, audit id bound | H | Yes | — | `lead_type` | ✓ | — | — | — | — | — | — | — |
| `leads:notify_resend` | Resend a failed lead notification to the agent | M | No | — | `lead_type` | ✓ | ✓ | — | — | — | — | — | — |
| `partners:read` | View partners, link versions and link health | L | No | — | — | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ |
| `partners:clicks:read` | View partner click summaries (counts by day and card, no student identity) | M | No | — | — | ✓ | ✓ | — | — | — | — | — | — |
| `partners:csv_import` | Upload a partner completion CSV (dry run, row validation, 5 000 rows max) | C | Yes | `partners.csv_import` | — | ✓ | — | — | — | — | — | — | — |

### 2.7 Exports

| Permission | Allows | Sens. | Step-up | Approval policy | Scopes | SA | OA | SU | FI | CL | AA | CM | AU |
|------------|--------|:---:|:---:|-----------------|--------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `exports:students` | Request a student CSV (allow-listed columns, purpose required, 5 000 rows) | C | Yes | `exports.students` | `countries` | ✓ | — | — | — | — | — | — | — |
| `exports:payments` | Request a payments CSV for accounting (no card data, 20 000 rows) | C | Yes | `exports.payments` | `countries` | ✓ | — | — | ✓ | — | — | — | — |
| `exports:leads` | Request an accommodation leads CSV with contact data (alignment with `REQ-ACC-06`) | C | Yes | `exports.leads` | `lead_type` | ✓ | ✓ | — | — | — | — | — | — |
| `exports:consultancy` | Download a consultancy's pseudonymised student CSV from the admin app (same content as the portal) | H | Yes | — | `consultancy_ids` | ✓ | — | — | — | — | — | ✓ | — |
| `exports:partner_clicks` | Request a partner click CSV with student references | C | Yes | `exports.partner_clicks` | — | ✓ | ✓ | — | — | — | — | — | — |

### 2.8 Consultancies

| Permission | Allows | Sens. | Step-up | Approval policy | Scopes | SA | OA | SU | FI | CL | AA | CM | AU |
|------------|--------|:---:|:---:|-----------------|--------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `consultancies:read` | List consultancies, funnel statistics, pseudonymised student lists, referral links and QR codes | M | No | — | `consultancy_ids` | ✓ | ✓ | — | — | — | — | ✓ | ✓ |
| `consultancies:manage` | Create, edit, activate, suspend, reactivate or archive a consultancy; referral code is immutable | H | Yes | — | `consultancy_ids` | ✓ | — | — | — | — | — | ✓ | — |
| `consultancies:users:manage` | Invite, disable or reset 2FA for consultancy portal users | H | Yes | — | `consultancy_ids` | ✓ | — | — | — | — | — | ✓ | — |
| `consultancies:reassign_student` | Request correcting a student's referral attribution (the only way to change a locked attribution) | C | Yes | `consultancies.reassign_student` | `consultancy_ids` | ✓ | — | — | — | — | — | ✓ | — |
| `consultancies:fraud:review` | Review referral fraud flags (confirm or dismiss) | M | No | — | `consultancy_ids` | ✓ | ✓ | — | — | — | — | ✓ | — |

### 2.9 Admin accounts, roles and access

| Permission | Allows | Sens. | Step-up | Approval policy | Scopes | SA | OA | SU | FI | CL | AA | CM | AU |
|------------|--------|:---:|:---:|-----------------|--------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `admins:read` | List admins, roles, last login, status (no secrets) | M | No | — | — | ✓ | — | — | — | — | — | — | ✓ |
| `admins:manage` | Invite an admin, assign or remove roles and scopes, suspend, reactivate | C | Yes | `admins.create`, `admins.assign_role` | — | ✓ | — | — | — | — | — | — | — |
| `admins:reset_2fa` | Reset another admin's TOTP after out-of-band verification | C | Yes | `admins.reset_2fa` | — | ✓ | — | — | — | — | — | — | — |
| `admins:sessions:manage` | List and revoke another admin's sessions | H | Yes | — | — | ✓ | — | — | — | — | — | — | — |
| `roles:read` | View roles, permission lists, role version history | M | No | — | — | ✓ | — | — | — | — | — | — | ✓ |
| `roles:manage` | Create, edit, archive or reset roles; permission changes create a new role version | C | Yes | `roles.update` | — | ✓ | — | — | — | — | — | — | — |

### 2.10 Approvals and workflow

| Permission | Allows | Sens. | Step-up | Approval policy | Scopes | SA | OA | SU | FI | CL | AA | CM | AU |
|------------|--------|:---:|:---:|-----------------|--------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `approvals:read` | Open the approvals inbox; each item additionally needs its own view permission | M | No | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| `approvals:decide` | Approve or reject requests where the caller's role is a listed approver and the caller is not the requester | H | Yes | — | — | ✓ | ✓ | — | — | — | — | — | — |
| `approvals:assign` | Assign inbox items to an admin | M | No | — | — | ✓ | ✓ | — | — | — | — | — | — |
| `approvals:policy:read` | View approval policies and their version history | M | No | — | — | ✓ | ✓ | — | — | — | — | — | ✓ |
| `approvals:policy:manage` | Change approval policies within hard floors; weakening raises a critical alert | C | Yes | `approvals.policy.update` | — | ✓ | — | — | — | — | — | — | — |
| `approvals:emergency_override` | Execute a pending request without a second approver where the policy allows it; reason ≥ 20 characters; 3 per day; review required | C | Yes | — | — | ✓ | — | — | — | — | — | — | — |
| `content:review` | View content diffs, validation and impact reports, and create preview sessions with draft overlays | M | No | — | — | ✓ | ✓ | — | — | ✓ | — | — | — |

### 2.11 Audit, alerts and reports

| Permission | Allows | Sens. | Step-up | Approval policy | Scopes | SA | OA | SU | FI | CL | AA | CM | AU |
|------------|--------|:---:|:---:|-----------------|--------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `audit:read` | Search and read audit entries (opaque ids only, redacted before/after) | M | No | — | — | ✓ | — | — | — | — | — | — | ✓ |
| `audit:verify` | Run chain verification and view checkpoints and anchors | M | No | — | — | ✓ | — | — | — | — | — | — | ✓ |
| `audit:export` | Export audit entries with a chain proof | C | Yes | — | — | ✓ | — | — | — | — | — | — | ✓ |
| `alerts:read` | View admin security and operations alerts | M | No | — | — | ✓ | ✓ | — | — | — | — | — | ✓ |
| `alerts:ack` | Acknowledge alerts and override reviews (not one's own override) | M | No | — | — | ✓ | ✓ | — | — | — | — | — | — |
| `reports:read` | Funnel, payment totals and queue sizes (counts and amounts, no personal data) | M | No | — | `countries`, `consultancy_ids` | ✓ | ✓ | — | ✓ | — | — | ✓ | ✓ |

### 2.12 Email and documents

| Permission | Allows | Sens. | Step-up | Approval policy | Scopes | SA | OA | SU | FI | CL | AA | CM | AU |
|------------|--------|:---:|:---:|-----------------|--------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `emails:read_delivery` | Delivery monitor: counts by template and status, failures by code, outbox lookup by student id (no addresses, no bodies) | M | No | — | — | ✓ | ✓ | ✓ | — | — | — | — | ✓ |
| `emails:resend` | Resend a resendable template for a student (new outbox row, reason) | M | No | — | `countries` | ✓ | ✓ | ✓ | — | — | — | — | — |
| `emails:suppression:manage` | Remove an address suppression (by student id) after verification | H | Yes | — | — | ✓ | — | — | — | — | — | — | — |
| `documents:read` | List a student's documents (invoices, credit notes, accepted Terms) | M | No | — | `countries` | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `documents:download` | Download a student's document on their behalf; audited | H | Yes | — | `countries` | ✓ | — | ✓ | ✓ | — | — | — | — |

### 2.13 Counts

Counts are recomputed from this file by CI (`T-ADM-003`): the number of rows in §2 must equal the number of keys in `permissions.ts`, and each key in the code appears here exactly once. At the time of writing the registry has **84 keys: 4 L, 40 M, 18 H, 22 C**; the test output is authoritative, so do not maintain these totals by hand.

## 3. System roles

System roles (`is_system = true`) cannot be deleted. Their permission lists can be changed only through the `roles.update` approval, creating a new role version; "reset to default" restores the list in this file. Assignments are made with `admins:manage` under the `admins.assign_role` policy.

| Role key | Intended holder | Summary | Notes |
|----------|-----------------|---------|-------|
| `super_admin` | The two founders | Every permission in §2 | At least two active Super Admins when two founders exist; the last Super Admin cannot be removed or suspended (`trg_last_super_admin`). Only role allowed to use emergency override. |
| `operations_approver` | Trusted second operator | Approves requests, reviews proofs, publishes content, handles leads and operations | Cannot manage roles or admins, cannot request refunds or mark-paid, cannot export students or payments. |
| `support` | Student support | Student search and timeline, masked identity, proof review (not approve), resend emails, notes, document download on behalf | No money movement, no identity reveal, no publishing. |
| `finance` | Bookkeeping | Payments, refund and mark-paid requests, payments export, documents | Cannot approve its own requests (not an approver role); no identity access. |
| `content_legal_editor` | Copy and legal drafting | Draft cards, texts, links, contact blocks and legal text; publish texts; edit legal variables | Cannot publish cards, links, SIM rules or legal (separation of drafting and publishing, SOD-003). |
| `accommodation_agent` | Roshan (accommodation partner) | `leads:read`, `leads:update_status`, `leads:note` with scope `{lead_type:['accommodation'], assigned_only:true}` and nothing else | Uses the agent portal and `/api/agent/**` (M08) with its own session and mandatory 2FA; no student, payment, identity, proof, card or admin permission. Exclusive in practice: assigning another role needs `admins.assign_role` approval and raises an alert. |
| `consultancy_manager` | NIVO staff who run partnerships | Consultancy create/manage, users, fraud review, reassign requests, consultancy export, funnel reports | Does not see identity, payments or student contact data beyond what the consultancy itself sees. |
| `auditor` | External or internal reviewer | Read-only: audit read/verify/export, admin and role listings, policies, alerts, reports, delivery monitor, document list | `exclusive = true` (SOD-001): cannot be combined with any other role. |

### Separation-of-duties rules

| ID | Rule | Enforcement |
|----|------|-------------|
| SOD-001 | A role marked `exclusive` (system role `auditor`) cannot be combined with any other role on the same admin | Blocked: `trg_admin_roles_guard`, role editor validation |
| SOD-002 | A custom role cannot hold `students:mark_paid` or `payments:refund` together with `approvals:decide`; the same admin must never both request and be eligible to decide money movement | Blocked at role save and assignment. Super Admin is exempt because of the two-founder team; the per-request rule (requester ≠ approver) still applies to Super Admin |
| SOD-003 | A custom role cannot hold both `legal:edit` and `legal:publish`, nor both `settings:sim_rules:edit` and `settings:sim_rules:publish`, nor both `cards:edit` and `cards:publish` | Blocked at role save. Super Admin exempt |
| SOD-004 | A custom role holding any of `identity:reveal`, `identity:download_file`, `identity:bulk_access` cannot also hold `exports:students` | Warned at role save (needs reason, raises a notice alert), blocked for new roles after a pilot period if no legitimate case appears (`GAP-ADM-SOD-004`) |
| SOD-005 | An approval policy cannot require more approvers than there are distinct eligible active approvers minus one; a policy save that would leave a pending request unapprovable is rejected | Blocked at policy save (`lld.md` F12); runtime SLA alert if the pool shrinks |

## 4. Approval policy defaults

`Req.` = required by default. `Min` = approver count. `Hard floor` = a policy that cannot be disabled (`required=false` rejected) and cannot allow emergency override. `Emerg.` = emergency override allowed. Expiry and SLA are hours. All policies force step-up for requester and approver and bind the decision to the payload hash.

| Policy key | Triggered by | Req. | Min | Approver roles | Expiry / SLA | Hard floor | Emerg. | Notes |
|------------|--------------|:---:|:---:|----------------|:------------:|:---:|:---:|-------|
| `payments.mark_paid` | `students:mark_paid` | Yes | 1 | OA, SA | 72 / 24 | Yes | No | Executor re-validates price, uniqueness and open Stripe sessions |
| `payments.refund` | `payments:refund` | Yes | 1 | OA, SA | 72 / 24 | Yes | No | Amount and revoke-access choice are part of the hash |
| `identity.bulk_access` | `identity:bulk_access` | Yes | 1 | SA, OA | 24 / 8 | Yes | No | Time-boxed grant, every access logged |
| `identity.purge` | `identity:purge` | Yes | 1 | SA | 24 / 8 | Yes | No | Irreversible |
| `content.publish.card` | `cards:publish` | Yes | 1 | OA, SA | 336 / 24 | No | Yes | Author cannot approve |
| `content.publish.partner_link` | `settings:links:publish` | Yes | 1 | OA, SA | 336 / 24 | No | Yes | Emergency path exists for a broken partner link |
| `content.publish.sim_rule` | `settings:sim_rules:publish` | Yes | 1 | OA, SA | 336 / 24 | Yes | No | Impact acknowledgement required |
| `content.publish.legal` | `legal:publish` | Yes | 1 | OA, SA | 336 / 48 | Yes | No | Legal wording owner is the lawyer (`GAP-LAWYER-TEXTS`) |
| `content.publish.text` | `settings:texts:publish` | No | 1 | OA, SA | 336 / 24 | No | Yes | Wording lint still runs |
| `content.publish.contact_block` | `settings:contact:publish` | Yes | 1 | OA, SA | 336 / 24 | No | Yes | Changes lead notification recipients |
| `cards.override` | `cards:override` | Yes | 1 | OA, SA | 72 / 24 | Yes | No | Consumed once by M06 `overrideCard` |
| `legal.cookies.publish` | `legal:cookies:publish` | Yes | 1 | OA, SA | 168 / 24 | No | No | |
| `roles.update` | `roles:manage` | Yes | 1 | SA | 72 / 12 | Yes | No | Escalation guard and SOD checked at request and at execution |
| `admins.create` | `admins:manage` | Yes | 1 | SA | 72 / 12 | Yes | No | |
| `admins.assign_role` | `admins:manage` | Yes | 1 | SA | 72 / 12 | Yes | No | Includes reactivation |
| `admins.reset_2fa` | `admins:reset_2fa` | Yes | 1 | SA | 24 / 4 | Yes | No | |
| `approvals.policy.update` | `approvals:policy:manage` | Yes | 1 | SA | 72 / 12 | Yes | No | Weakening raises a critical alert |
| `settings.admin_security.update` | `settings:admin_security:edit` | Yes | 1 | SA | 72 / 12 | Yes | No | Only inside hard bounds |
| `settings.allowlist.update` | `settings:link_allowlist:edit` | Yes | 1 | SA, OA | 72 / 12 | Yes | No | |
| `consultancies.reassign_student` | `consultancies:reassign_student` | Yes | 1 | OA, SA | 168 / 24 | Yes | No | Bound to a `SECURITY DEFINER` function (M10) |
| `partners.csv_import` | `partners:csv_import` | Yes | 1 | OA, SA | 72 / 24 | Yes | No | Dry-run diff attached |
| `exports.students` | `exports:students` | Yes | 1 | OA, SA | 24 / 8 | Yes | No | |
| `exports.payments` | `exports:payments` | Yes | 1 | OA, SA | 24 / 8 | Yes | No | |
| `exports.leads` | `exports:leads` | Yes | 1 | OA, SA | 24 / 8 | Yes | No | Aligns with `REQ-ACC-06`; M08 builds the file |
| `exports.partner_clicks` | `exports:partner_clicks` | Yes | 1 | OA, SA | 24 / 8 | Yes | No | M07 builds the file |
| `proofs.approve` | `proofs:approve` | No | 1 | OA, SA | 24 / 4 | No | No | Switchable on if proof fraud appears; bulk decisions then disabled |

Rules that apply to every policy:

- The default is **one** approver (two founders cannot satisfy two). Raising `Min` to 2 is accepted only if SOD-005 holds.
- `approvals.policy.update` can raise strictness freely; lowering `Min`, removing an approver role, or turning `Req.` off is a "weakening" change and raises a critical alert to all Super Admins and the auditor.
- A request expires unexecuted after `Expiry` hours (status `expired`, requester notified). An approved content version must be published within `content.approved_valid_days` (default 14).
- Emergency override is limited to Super Admin, to policies marked "Emerg.", 3 per day per admin, reason ≥ 20 characters; it executes at once, flags the request `override=true`, writes a critical audit entry, alerts the other Super Admins and creates an `override_review` inbox item that someone other than the overrider must acknowledge within 24 h.

## 5. Scopes

| Scope key | Type | Applies to | Effect |
|-----------|------|------------|--------|
| `countries` | ISO-3166 alpha-2 list | Student-related permissions | Student, payment, identity, proof, consent and email data limited to students whose registration country is in the list |
| `lead_type` | list, currently `['accommodation']` | `leads:*`, `exports:leads` | Limits lead types |
| `assigned_only` | boolean | `leads:read`, `leads:update_status`, `leads:note` | Only leads assigned to the caller (the accommodation agent) |
| `consultancy_ids` | uuid list | `consultancies:*`, `exports:consultancy`, `reports:read` | Limits consultancies |

Rules: a scope is attached to the role **assignment** (`admin_roles.scope`), not to the role. `NULL` means unrestricted. A scope key on a permission that does not list it is ignored and rejected at save. When an admin holds several roles, scopes are evaluated per permission: if any granting assignment is unrestricted, access is unrestricted; otherwise the union of scopes applies. Phase 1 launches with no `countries` scopes in use; the field exists so the model does not change when staff are added.

## 6. Registry change process

1. Propose the key in the module LLD with its sensitivity, step-up, approval policy and role mapping, following the rules in §1.
2. Add the key to `packages/shared/src/permissions.ts` and to this file in the same PR. `T-ADM-003` fails when the two disagree.
3. Add the key to the default role mappings in §2 and a `roles.update`-style migration that assigns it to system roles. Migrations never silently grant `C` permissions to a custom role.
4. The migration runs as a numbered SQL file; existing admins gain the permission only through their roles, and the audit log records `role.version_created` with the added keys.
5. Deprecation: set `deprecated_at`; the key stays valid for existing roles for one release, then roles that contain it fail validation until updated. Keys are never reused.
6. A route that needs a permission not in the registry cannot merge: CI rejects routes that declare no permission or an unknown one.

## 7. Reconciliation with names used in M01–M08

M03–M08 drafted their admin routes before this registry existed and use dotted or `staff:` names. The canonical keys are the ones in §2; the LLDs of those modules should be updated to them (`GAP-ADM-KEY-ALIGNMENT`). Until then, this table is the mapping the permission middleware accepts in documentation and test names; **the code never accepts an alias**.

| Module | Name in module LLD | Canonical key or policy | Remark |
|--------|--------------------|--------------------------|--------|
| M03 | `staff:legal.read` | `legal:read` | |
| M03 | `staff:legal.edit` | `legal:edit` | |
| M03 | `staff:legal.publish`, policy `legal.publish` | `legal:publish`, policy `content.publish.legal` | Approver ≠ author and ≠ submitter, enforced by the Approval Engine |
| M03 | `staff:legal.variables.manage` | `legal:variables:edit` | |
| M03 | `staff:legal.cookies.manage`, policy `legal.cookies.publish` | `legal:edit` for drafts, `legal:cookies:publish` and policy `legal.cookies.publish` for publishing | |
| M03 | `staff:legal.consents.read` | `legal:consents:read` | Reason in query, logged |
| M04 | `staff:payment.mark_paid.approve`, `staff:payment.refund.approve` | `approvals:decide` plus approver roles of policies `payments.mark_paid`, `payments.refund` | |
| M05 | `identity.view_masked` | `identity:view_masked` | |
| M05 | `identity.reveal` | `identity:reveal` (fields) and `identity:download_file` (files) | M05 uses one permission for both; two keys allow different role grants |
| M05 | `identity.export` | Student self-service export is not an admin permission; admin-built DSR export, if added, needs a new key (`GAP-ADM-DSR-EXPORT`) | |
| M05 | `identity.purge` | `identity:purge`, policy `identity.purge` | |
| M05 | step-up valid "≤ 10 min"; reveal limit 20 per hour | 300 s window; 5 per 10 min and 20 per day (`identity.reveal_limit_*`) | M09 settings are authoritative (stricter); M05 reads them (`GAP-ADM-KEY-ALIGNMENT`) |
| M05, M07 | `partners.proof.review` for `owner_module = 'proof'` file access | `proofs:view_files` | |
| M06 | `cards.view` | `cards:read` | |
| M06 | `cards.edit` | `cards:edit` (`cards:create` for new cards) | |
| M06 | `cards.review` | `approvals:decide` + `content.publish.card` approver roles; `content:review` for diffs | |
| M06 | `cards.publish` | `cards:publish` | |
| M06 | `cards.rules.edit`, `cards.rules.publish` | `settings:sim_rules:edit`, `settings:sim_rules:publish` | Unlock rules are the SIM rule content type |
| M06 | `cards.override`, policy `cards.override` | `cards:override`, policy `cards.override` | |
| M06 | `cards.reorder` | `cards:reorder` | |
| M07 | `partners.view` | `partners:read` | |
| M07 | `partners.edit` | `settings:links:edit` | Partner records and link versions are the `partner_link` content type |
| M07 | `partners.link.review`, `partners.link.publish` | `approvals:decide` + policy `content.publish.partner_link`, `settings:links:publish` | |
| M07 | `partners.view_clicks` | `partners:clicks:read` | |
| M07 | policy `exports` for clicks | `exports:partner_clicks`, policy `exports.partner_clicks` | |
| M07 | `partners.proof.review` | `proofs:read`, `proofs:approve`, `proofs:reject` | |
| M07 | `partners.proof.view_files` | `proofs:view_files` | |
| M07 | policy `partners.proof.approve` | policy `proofs.approve` | Off by default |
| M07 | `partners.completion.import`, policy of the same name | `partners:csv_import`, policy `partners.csv_import` | |
| M08 | `leads.read_own`, `leads.read_all` | `leads:read` with or without scope `assigned_only` | Support holds the unscoped form |
| M08 | `leads.update_status`, `leads.note`, `leads.assign` | `leads:update_status`, `leads:note`, `leads:assign` | |
| M08 | `leads.correct`, `leads.notify_resend` | `leads:correct`, `leads:notify_resend` | |
| M08 | `leads.export`, policy `exports` | `exports:leads`, policy `exports.leads` | |
| M08 | `approvals.decide` | `approvals:decide` | |
| M10 | policy `referrals.override` | `consultancies.reassign_student` | Already renamed in M10 |
| M11 | resend, delivery monitor, suppression | `emails:resend`, `emails:read_delivery`, `emails:suppression:manage` | |

Admin route prefixes differ between modules (`/admin-api`, `/admin`, `/api/admin`, `/api/agent`). The prefix is not a security boundary: all admin-host routes register in one route registry and pass the same guard chain (`lld.md` §2).
