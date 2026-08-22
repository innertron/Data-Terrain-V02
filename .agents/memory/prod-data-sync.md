---
name: Production data sync
description: Why production data is separate and when metadata-only sync is required
---

Production has its OWN database, separate from dev. Publishing deploys code + schema only — layer data never transfers automatically.

For primary-medium or affiliation corrections, use the metadata-only sync. Do not use the destructive full mirror when production terrain grids may intentionally differ.

**Why:** Republish does not transfer data, and a full mirror replaces production layers and grids. Metadata-only corrections must not overwrite terrain, portraits, ranks, or demographic fields.

**How to apply:** Run `node scripts/sync-prod.js --medium-only` for primary-medium/affiliation corrections; it uses the live API and verifies protected fields. Use the full sync only when an exact destructive mirror is explicitly intended. Never write production data with DDL/SQL.

Full layer syncs must treat each layer's immutable original grid as the authoritative snapshot, validate it against any saved trace total, and preserve the mutable working grid separately.

**Why:** Working grids can be rounded or skewed. Reusing one as the new original changes exact ViewerScore totals and destroys the restore point.

**How to apply:** Preflight dimensions, finite values, and trace totals; stage and verify complete replacements before deleting old rows; transfer original and working grids, active state, and shape parameters independently.

Full-sync retries must treat duplicate layer names as resumable state, not an unrecoverable validation error.

**Why:** A transient failure while deleting old rows can leave verified replacements beside stale rows. Rejecting duplicates on retry strands production in a hybrid state.

**How to apply:** If every development layer has an exact replacement candidate, keep one verified candidate per name and delete only stale rows. If staging was incomplete, remove only newer duplicates before restaging.

After a task merge, compare development and production layer names before importing another layer. A merge can leave the development database behind production even when saved manifests and traces remain present.

**Why:** Production retained three valid layers that the post-merge development database lacked, making the next import produce the wrong expected project count.

**How to apply:** Re-import missing records from their saved manifests into development, validate exact source totals, and confirm the count before adding the next layer. Do not copy mutable production grids back into development.
