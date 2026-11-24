# TDD foundation

## Tooling (in repo)

- Vitest — unit/integration
- fast-check — property tests (validators, SIM engine)
- Playwright — E2E skeletons in `apps/web/e2e`
- In-memory repositories — no Postgres required for unit tests
- CI — `.github/workflows/ci.yml`

## Next hardening

- Testcontainers Postgres
- Stryker mutation on shared/cards/payments/permissions
- Generated permission-matrix test from OpenAPI
- axe in Playwright
