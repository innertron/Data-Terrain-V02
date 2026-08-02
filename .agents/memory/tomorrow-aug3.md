---
name: Tomorrow Aug 3 priorities
description: Things the user wants to tackle next session (noted 2026-08-02 end of night).
---

## 1 — Expand Project Settings modal with label editing
The existing **Project Settings** modal (wrench icon, already has IDENTITY and AXIS LABELS sections) is where all label editing lives. Add sections below AXIS LABELS:
  1. **X-Axis Labels** — editable grid for the 25 X labels (currently `X_LABELS` hardcoded in `Home.tsx`)
  2. **Z-Axis Labels** — editable grid for the 25 Z labels (currently `Z_LABELS` hardcoded in `Home.tsx`)
  3. **X Middle Names** — editable grid for `X_MIDDLE_NAMES` (inspector detail labels)
  4. **Z Middle Names** — editable grid for `Z_MIDDLE_NAMES` (inspector detail labels)
- Axis title fields (X-AXIS TITLE, Z-AXIS TITLE) are already in the modal per the screenshot.
- All values should persist to `project_settings` DB table (already exists).
- No separate "Change Labels" footer button needed — everything goes in the modal that already exists.

## 2 — Project name not showing when published — FIXED 2026-08-02
- Root cause: production DB had no `project_settings` rows; dev DB had them.
- Fix: curled `PUT /api/settings/:key` on `data-terrain.replit.app` to seed all three values.
- Task #12 proposed to solve this permanently at the server level.

## 3 — Bugs fixed this session (2026-08-02)
- **Layers "Loading..."**: Task #4 merge left layers table empty while `layers_seeded=1` was set. Server restart re-seeded. Root cause resolved.
- **Refresh Stream crash**: `gcTime: 0` in `useSegments` was evicting cache on invalidation → `isLoading` true → Canvas unmounted → WebGL context lost. Fix: removed `gcTime: 0`, added `placeholderData: keepPreviousData`, guarded `isLoading && !segments` in Landscape3D.
- **All layers off = flat terrain**: was showing raw DB values. Fixed: when `layerDefs.length > 0` but `activeLayers` empty, return all-zero Map.
- **Layer row colors**: all overridden to `#a8d4d2` in UI; text changed to `text-black`.

## 3 — New project (after items 1 & 2)
- Create a brand-new DemoScape project (separate repl / separate URL).
- Feature: **random distribution layer** — after a layer CSV is submitted, apply a configurable random ± noise to make values slightly stochastic.
- Must deploy to a **different URL** from the current minedICE project.
- Think about the methodology for the random distribution step before building.
