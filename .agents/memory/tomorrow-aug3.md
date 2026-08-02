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
- Going forward: whenever settings change in dev, they must also be pushed to prod via the same curl pattern (or a future "sync to prod" button).

## 3 — New project (after items 1 & 2)
- Create a brand-new DemoScape project (separate repl / separate URL).
- Feature: **random distribution layer** — after a layer CSV is submitted, apply a configurable random ± noise to make values slightly stochastic.
- Must deploy to a **different URL** from the current minedICE project.
- Think about the methodology for the random distribution step before building.
