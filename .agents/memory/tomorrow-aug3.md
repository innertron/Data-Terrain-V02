---
name: Tomorrow Aug 3 priorities
description: Things the user wants to tackle next session (noted 2026-08-02 end of night).
---

## 1 — Change Labels UI
Under the "Refresh Stream" and "New Project" footer buttons, add a single **"Change Labels"** button.
- Opens a modal/drawer with three sub-options:
  1. **Change Axes Names** — rename X and Z axis titles
  2. **Change Label Names** — rename the 25 X labels and 25 Z labels
  3. **Change Label Detail Names** — rename the middle/detail names shown in the inspector
- Each sub-option delivers a CSV grid (or inline table) where the user can type and save.
- Currently: axis labels are hardcoded in `Landscape3D.tsx`; X_LABELS, Z_LABELS, X_MIDDLE_NAMES, Z_MIDDLE_NAMES are hardcoded in `Home.tsx`.
- The values should be stored in `project_settings` (already in DB) so they persist.

## 2 — Project name not showing when published
- In dev preview "TESTER" shows correctly.
- On the deployed/published site the project title is missing.
- Likely cause: the `/api/settings` call that fetches `project_title` may not be reaching the right DB on the deployed environment, OR the env variables differ.
- Check deployment logs and DB connection on the published version.
- Relevant: `client/src/pages/Home.tsx` fetches settings via `useQuery`, server routes in `server/index.ts`.

## 3 — New project (after items 1 & 2)
- Create a brand-new DemoScape project (separate repl / separate URL).
- Feature: **random distribution layer** — after a layer CSV is submitted, apply a configurable random ± noise to make values slightly stochastic.
- Must deploy to a **different URL** from the current minedICE project.
- Think about the methodology for the random distribution step before building.
