# Acceptance tests

## From brief (1–10)

| # | Scenario | Automated |
|---|----------|-----------|
| 1 | Register, verify, login → payment only | Playwright T-E2E-01 |
| 2 | Pay via webhook → dashboard + receipt + PDF | T-E2E-02 |
| 3 | Cards 1+3 open, SIM locked with progress, 4 coming soon | T-E2E-03 |
| 4 | Card1 opens tracked Expatrio link; click logged | T-E2E-04 |
| 5 | Admin completes card1 → SIM unlock + email + Vodafone link | T-E2E-05 |
| 6 | Add insurance card as SIM requirement; test student without unlock must complete it | T-E2E-06 |
| 7 | Unpaid cannot open cards by URL | T-E2E-07 |
| 8 | Accommodation form → Roshan ≤1 min; agent updates; student sees status | T-E2E-08 |
| 9 | Admin link change live without release | T-E2E-09 |
| 10 | Legal pages, cookie banner, Terms version saved, deletion request | T-E2E-10 |

## Extra

- Identity encryption + retention job
- Consultancy RLS isolation
- Maker-checker cannot self-approve
- Audit tamper detection
