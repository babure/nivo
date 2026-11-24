# ADR-004: Field and file encryption

## Decision

AES-256-GCM application-level encryption for identity fields; envelope encryption for files in private Hetzner Object Storage; key IDs for rotation; master key outside DB (env/SOPS).

## Status

Accepted
