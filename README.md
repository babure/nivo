# NIVO Student Platform

Student journey platform for NIVO UG (Berlin): registration, €149 payment, encrypted identity capture, 4-card dashboard, granular admin panel, and consultancy referral tracking.

## Stack

| Package | Role |
|---------|------|
| `apps/web` | React + Vite + Tailwind + React Router |
| `apps/api` | Fastify + domain services (in-memory or Postgres) |
| `packages/shared` | Zod schemas, permissions, card engine, crypto helpers |

## Quick start

```bash
pnpm install
pnpm --filter @nivo/shared test
pnpm --filter @nivo/api test
pnpm --filter @nivo/web test
pnpm --filter @nivo/api dev    # http://localhost:4000  (seeds test users)
pnpm --filter @nivo/web dev    # http://localhost:5173
```

Copy `apps/api/.env.example` when wiring real Postgres/Stripe.

### Dev seed accounts

In development the API loads fixed test personas (password for all: `NivoTest1234`). Useful starters:

| Email | ID | Flow |
|-------|----|------|
| `unpaid@nivo.test` | `a0000001-0000-4000-8000-000000000001` | `/pay` |
| `paid@nivo.test` | `a0000001-0000-4000-8000-000000000002` | identity onboarding |
| `dashboard@nivo.test` | `a0000001-0000-4000-8000-000000000003` | student dashboard |
| `full@nivo.test` | `a0000001-0000-4000-8000-000000000005` | cards + accommodation lead |
| `admin@nivo.test` | `b0000001-0000-4000-8000-000000000001` | `/admin/login` (super_admin) |
| `consultancy@nivo.test` | `c0000001-0000-4000-8000-000000000001` | `/consultancy` |

Referral demo: `/r/BERLINEDU`. Set `SEED_DEV_DATA=false` to skip. Full table prints in the API console on startup.

Without Stripe keys, `/pay` offers a **demo payment** so the unpaid → identity → dashboard path still works. Admin (`/admin/login`), consultancy (`consultancy@nivo.test`), documents, profile (2FA / deletion), and legal pages are wired to the API.

## Design docs

Start at [`docs/design/00-system-hld.md`](docs/design/00-system-hld.md). Module HLD/LLD live under `docs/design/mNN-*`. UX prototype: `docs/design/ux/prototype/index.html`.

## Security & privacy

- Field/file encryption for identity data (AES-256-GCM)
- Server-side sessions + CSRF; admin 2FA
- Permission registry + maker-checker approvals
- Cookie banner (TDDDG), consents versioned
- Hosting target: Hetzner Germany

See `docs/security/` and `docs/privacy/`.

## Tests (TDD)

Domain logic is test-first in `@nivo/shared` and `@nivo/api`. CI runs typecheck + unit tests on push.

## Brand

Orange `#FB770B` · Saffron `#E8A55C` · Beige `#F5EFE6` · Charcoal `#2D2A26` · Poppins
