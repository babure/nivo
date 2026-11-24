# Encryption and key management

- Algorithm: AES-256-GCM
- Field encryption: passport number, parents' names, addresses
- File encryption: passport scan, signature, proofs — envelope key per object
- Key ID column for rotation
- Master key: environment / SOPS; never in repo or DB
- Rotation drill: encrypt with new keyId, dual-read during migration
- Backup of keys: offline dual custody (ops runbook)
- Tests: `T-ID-001`, crypto unit tests in `@nivo/shared`
