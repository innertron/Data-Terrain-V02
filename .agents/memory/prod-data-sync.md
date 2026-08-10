---
name: Production data sync
description: Why the published app looked "old" and how to sync layer data to prod
---

Production has its OWN database, separate from dev. Publishing deploys code + schema only — layer data never transfers automatically.

**Why:** On 2026-08-10 the user republished 6+ times believing publish was broken; every publish actually succeeded, but prod still showed old FANS test layers because Sean Hannity existed only in the dev DB.

**How to apply:** After adding/changing layers in dev, run `node scripts/sync-prod.js` (dev server must be running). It mirrors ALL dev layers to prod via the live app's API — deletes stale prod layers, recreates from dev with grid, rank, affiliation, medium, name2/description/icon. Never run DDL/SQL writes against prod. Schema changes still require a republish; data changes never do.
