# HLD: M01 — Infrastructure

| Field | Value |
|-------|-------|
| Status | Review |
| Requirements | REQ-SEC-01 |

## Purpose

Provide German hosting, Postgres with RLS roles, private encrypted object storage, backups, PII-redacted logging, security headers, health checks, and secrets handling.

## Components

- Hetzner VM / managed app + Cloud Firewall
- PostgreSQL 16 encrypted volume; roles `nivo_app`, `nivo_migrator`, `nivo_readonly`
- Hetzner Object Storage (private bucket)
- Reverse proxy: TLS 1.2+, HSTS, CSP, rate limits
- Structured logger with redaction paths (email, phone, passport, Authorization)
- SOPS / env secrets for encryption master key, Stripe, DB

## Data classification

Infra config: Internal. Secrets: Sensitive. Logs: Personal scrubbed to Internal.

## Failure modes

RISK-PLAT-MIGRATE, RISK-ID-KEY-LOSS — expand-contract migrations; key backup drills.

## Controls

CTRL-INFRA-TLS, CTRL-INFRA-BACKUP, CTRL-INFRA-HEADERS, CTRL-INFRA-LOG-REDACT

## Test strategy

T-SEC-001 health + headers; restore drill checklist in launch module.
