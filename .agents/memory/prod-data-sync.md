---
name: Production data sync
description: Why production data is separate and when metadata-only sync is required
---

Production has its OWN database, separate from dev. Publishing deploys code + schema only — layer data never transfers automatically.

For primary-medium or affiliation corrections, use the metadata-only sync. Do not use the destructive full mirror when production terrain grids may intentionally differ.

**Why:** Republish does not transfer data, and a full mirror replaces production layers and grids. Metadata-only corrections must not overwrite terrain, portraits, ranks, or demographic fields.

**How to apply:** Run `node scripts/sync-prod.js --medium-only` for primary-medium/affiliation corrections; it uses the live API and verifies protected fields. Use the full sync only when an exact destructive mirror is explicitly intended. Never write production data with DDL/SQL.

Before a full layer sync, compare each trace-backed layer's current `gridValues` total with the exact `totalMillions` in its saved trace. The skew endpoint rounds working-grid cells to four decimals, while `originalGridValues` retains the exact imported grid; syncing the mutable working grid can therefore make live ViewerScore totals drift.

**Why:** A full mirror copied rounded development working grids to production, causing exact imported totals to display incorrectly even though development's permanent originals were still correct.

**How to apply:** Restore affected development layers from their original snapshots, verify their exact totals, then replace only those live rows when possible. Create and verify each replacement before deleting its old production row so a failed repair cannot leave the layer missing.
