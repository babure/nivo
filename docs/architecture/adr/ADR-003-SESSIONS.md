# ADR-003: Sessions not JWT-in-localStorage

## Decision

Server-side sessions in PostgreSQL, cookie `HttpOnly; Secure; SameSite=Lax`, plus CSRF token. Admin area separate cookie scope.

## Why

Revocable, no XSS token theft from localStorage, matches security plan.

## Status

Accepted
