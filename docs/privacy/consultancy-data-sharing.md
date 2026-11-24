# Consultancy Data Sharing

| Field | Value |
|-------|-------|
| Status | Review (draft for counsel, `GAP-CONSULTANCY-VISIBILITY`, `GAP-CON-LAWFUL-BASIS`) |
| Owner | Product (CEO) with counsel |
| Last updated | 2026-11-24 |
| Related | M10 HLD/LLD, `consent-spec.md`, `ropa.md` (activity 10), `processor-register.md` §2, `dsr-runbook.md` §3.5–3.6 |

## 1. Context

Consultancies (education agents) refer students to NIVO. They want to see whether their referred students registered, paid and progressed. NIVO is the controller of student data; the consultancy is an **independent controller** of whatever it already knows about its own client. NIVO shares only the minimum needed, pseudonymised by default, and never shares identity data.

## 2. What a consultancy can and cannot see

| Data | Visible to the consultancy? | Condition |
|------|-----------------------------|-----------|
| Pseudonym ID (`S-XXXXXXXXXX`, random) | Yes | Always |
| First name + last initial | Yes | Always (needed to recognise the student in the consultancy's own records; `GAP-CONSULTANCY-VISIBILITY` to confirm with counsel) |
| Country, intake term | Yes | Always |
| Funnel stage and dates: registered, email verified, paid (boolean + date, **no amount**), identity completed (boolean), card completed (stage names), SIM unlocked | Yes | Always, as aggregate counts and per pseudonymous row |
| Campaign tag from the referral link | Yes | Always |
| Email address and phone number | **Only with the student's consent** | Separate unticked, versioned consent "Share my contact details with {Consultancy}"; withdrawable; removed within 1 hour of withdrawal |
| Passport data, address, family names, signature, any identity field | **Never** | No read path exists (no grants, no view) |
| Payment details (amount, method, refund state, invoice) | **Never** | — |
| Documents, proofs, accommodation lead content, admin notes, fraud flags | **Never** | — |
| Other consultancies' students | **Never** | RLS on `consultancy_id` (T-CON-010) |

Rationale: students already told the consultancy they are applying; stage visibility helps the consultancy support them and reconcile commissions later. Anything beyond stage and first name requires the student's own consent.

## 3. Lawful basis

| Processing | Basis | Notes |
|------------|-------|-------|
| Recording who referred the student (attribution) | Art. 6(1)(f) legitimate interest of NIVO and the consultancy in attributing referrals; notice shown at registration ("You were invited by {name}"); right to object (Art. 21) | Counsel to confirm vs consent (`GAP-CON-LAWFUL-BASIS`) |
| Sharing pseudonymised funnel row | Art. 6(1)(f) with minimisation | Fallback if counsel prefers: make the *entire* funnel row consent-based and offer aggregate-only otherwise (design switch `consultancy.row_visibility = consent_only` already specified) |
| Sharing contact details | Art. 6(1)(a) explicit consent | Consent text is a versioned document in M03 (`consultancy-share`); ledger records version, time, IP hash |

## 4. Student-facing disclosure and consent

Registration page (unticked, optional): "Share my contact details with {Consultancy}. They may contact me about my move to Germany. I can withdraw this any time in Profile → Privacy."

Information given before registration submit (Art. 13 layer): referral banner naming the consultancy; link to Privacy Policy section "Consultancies".

Profile → Privacy centre: shows the consultancy, what they can see, toggle for contact sharing, button "Object to this referral link" (opens a DSR of type objection).

## 5. Agreement requirements (before a consultancy can be activated)

M10 refuses to activate a consultancy without agreement and DPA/data-sharing dates (M10 LLD). The agreement must contain:

1. Roles: NIVO controller of platform data; consultancy independent controller of its own client data; no joint control of the platform.
2. Purpose limitation: use data only to support the referred student and reconcile referrals; no marketing to students without the student's separate consent; no resale; no profiling for other purposes.
3. Security: unique named users, mandatory 2FA, no credential sharing, device security, confidentiality of CSV exports (they are formula-safe but still personal data), deletion of downloaded copies on request.
4. Deletion on notice: when NIVO notifies erasure, objection or consent withdrawal, the consultancy deletes shared contact details and exports of that student within 7 days and confirms.
5. Breach notification to NIVO within 24 hours of awareness (NIVO has 72 h to notify the authority).
6. Sub-processing: no onward disclosure except to its own processors under Art. 28 terms.
7. Audit/inspection rights and the right to suspend access immediately on suspected misuse (M10 suspend action).
8. International transfers: consultancies are often outside the EU (e.g. India, Nepal). Transfers of contact details to a third-country controller require Art. 46 safeguards (SCCs Module 1 controller-to-controller) or rely on the student's explicit consent with the Art. 49(1)(a) information (`GAP-CON-TRANSFER`, counsel). Pseudonymised rows with first name + initial are also personal data.
9. Liability, termination, return/deletion of data at end.
10. Commission terms are out of scope in Phase 1 (`GAP-CONSULTANCY-COMMISSION`).

## 6. Controls (technical)

| Control | Where |
|---------|-------|
| Row Level Security on `consultancy_id`; consultancy DB role has no grant on student or identity tables; dashboard reads only a projection (`referral_funnel`) | M10 `CTRL-CON-RLS` |
| Pseudonym random, not derivable from user ID | M10 |
| Contact sharing table populated only while consent is `granted`; deleted on withdrawal, reassignment, suspension, erasure | M10 |
| Mandatory TOTP for consultancy users, separate host and cookie | M02, M10 `CTRL-AUTH-2FA` |
| Export: formula-safe CSV, row cap, audited with row count only, nothing stored | M10, M09 (`exports:consultancy`) |
| Reassignment of attribution requires approval (`referrals.override`) and resets share consent | M09, M10 |
| Anti-fraud flags reviewed by humans; no automatic penalty on students | M10 |
| Isolation matrix test run in CI and as a production canary | T-CON-010 and related |

## 7. Student rights

| Right | How it works with consultancies |
|-------|--------------------------------|
| Access | Export lists consultancy name, code, attribution date, consent state, what the consultancy could see |
| Erasure | Funnel row stripped to aggregates, shared contact deleted, attribution link removed; consultancy notified to delete copies |
| Objection | Removes attribution; student becomes "unattributed" |
| Withdrawal of contact consent | Immediate hide + deletion; consultancy keeps only what it already collected from the student itself |
| Correction | Name edits flow to the funnel display name via event |

## 8. Incident handling

A cross-tenant exposure or misuse by a consultancy is playbook **P6** in `incident-response.md`: suspend, count rows seen, delete shared contacts, notify the authority/students if risk, notify the consultancies concerned.

## 9. Counsel questions

| ID | Question |
|----|----------|
| GAP-CONSULTANCY-VISIBILITY | Is first name + last initial + stage acceptable under legitimate interest, or is consent required for any per-student row? |
| GAP-CON-LAWFUL-BASIS | Is the attribution record itself covered by Art. 6(1)(f)? Do we need an opt-in at registration? |
| GAP-CON-TRANSFER | Transfer mechanism for consultancies outside the EU |
| GAP-CON-ERASURE-NOTICE | Wording of the deletion-on-notice clause and evidence of deletion |
| GAP-CON-TEXT | Final text of the sharing consent and the Privacy Policy "Consultancies" section |
