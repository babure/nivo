# Technical and Organisational Measures (Art. 32 GDPR)

| Measure | Implementation |
|---------|----------------|
| Pseudonymisation / encryption | Field + file AES-GCM; consultancy pseudonymised views |
| Confidentiality | RBAC permissions, RLS, admin 2FA, step-up |
| Integrity | Audit hash chain, webhook signatures, migrations reviewed |
| Availability | Hetzner backups, restore drills, health checks |
| Resilience | Job retries, dead-letter, reconcile payments |
| Regular testing | TDD, CI, pen test before launch, ASVS L2 |
| Access control | Least privilege DB roles, deny-by-default API |
| Logging | PII redaction; no secrets in logs |
