# ADR-001: Stack

## Decision

pnpm monorepo: `apps/web` (React, Vite, Tailwind, React Router), `apps/api` (Node, Fastify), `packages/shared` (zod, domain), PostgreSQL 16 + Drizzle, Vitest + Playwright.

## Why

Matches brief (React + Tailwind), TypeScript end-to-end, shared validation for TDD, Fastify performance and schema validation, Drizzle typed SQL with RLS support.

## Status

Accepted
