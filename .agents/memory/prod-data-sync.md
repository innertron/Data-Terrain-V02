---
name: Production data sync
description: Why the published app looked "old" and how to sync layer data to prod
---

Production has its OWN database, separate from dev. Publishing deploys code + schema only — layer data never transfers automatically.

**Why:** On 2026-08-10 the user republished 6+ times believing publish was broken; every publish actually succeeded, but prod still showed old FANS test layers because Sean Hannity existed only in the dev DB.

**How to apply:** After adding/changing layers in dev, sync prod via the live app's own API (never DDL/SQL writes against prod):
- `POST https://data-terrain-v-02.replit.app/api/layers` with `{name, color:"#a8d4d2", csv, rank, affiliation, primaryMedium}` (25×25 CSV, header x1..x25)
- `DELETE .../api/layers/<id>` for stale prod layers
- Verify with `GET .../api/layers`
