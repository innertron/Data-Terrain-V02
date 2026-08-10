---
name: Axis label/description storage
description: Where X/Z axis labels & descriptions live and how to update them
---
Axis labels + descriptions are no longer hardcoded per-file. Defaults live in `client/src/lib/axisData.ts`; overrides are stored in `project_settings` keys `axis_x` / `axis_z` as JSON `{labels[25], descriptions[25]}` via GET/PUT `/api/axis(/:axis)`.

**Why:** user updates Z (and X) axis data regularly via CSV in the Inspector's "X and Z Axis Tools" instead of asking for hardcoded edits.

**How to apply:** never re-hardcode axis text in Home.tsx/Landscape3D.tsx — edit defaults in axisData.ts or set via the API. Z arrays stay HIGH→LOW ($20B+ first). CSV format: 25 rows `label,description`, first comma splits. `scripts/sync-prod.js` copies axis settings to prod via PUT /api/settings/:key (prod needs republish before /api/axis exists there). Layer Tools stay dev-only; Axis Tools are visible in production.
