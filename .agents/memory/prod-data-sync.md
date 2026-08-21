---
name: Production data sync
description: Why production data is separate and when metadata-only sync is required
---

Production has its OWN database, separate from dev. Publishing deploys code + schema only — layer data never transfers automatically.

For primary-medium or affiliation corrections, use the metadata-only sync. Do not use the destructive full mirror when production terrain grids may intentionally differ.

**Why:** Republish does not transfer data, and a full mirror replaces production layers and grids. Metadata-only corrections must not overwrite terrain, portraits, ranks, or demographic fields.

**How to apply:** Run `node scripts/sync-prod.js --medium-only` for primary-medium/affiliation corrections; it uses the live API and verifies protected fields. Use the full sync only when an exact destructive mirror is explicitly intended. Never write production data with DDL/SQL.
