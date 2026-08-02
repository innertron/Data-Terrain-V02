---
name: ConTour wiring
description: State of the ConTour/layer system — what's built, what's deferred, and design decisions.
---

## What exists in code
- `client/src/lib/demoContours.ts` — defines ConTourValue/ConTour types, 3 demo layers (Gaussian), `computeEffectiveValues()`
- `Landscape3D` / `Bar` / `SurfaceTerrain` / `FloatingLabel` — all accept `effectiveValues?: Map<string,number>` and `overrideValue?` props; wiring is complete but dormant (no UI passes these props)
- `scripts/generate-layer*.mjs` + `scripts/sum-layers.mjs` + `scripts/normalize-and-load.mjs` — manual pipeline: build CSVs → sum → normalize 0-100 → push to `grid_segments`

## What was removed (per user instruction)
- ConTour panel from Inspector (Home.tsx) — removed 2026-08-01; user never authorized it

## Deferred features
- **Per-layer debug view**: admin/dev only toggle to isolate and view a single layer — NOT for regular users
- **DB-backed layers table**: store layers as rows, compute sum+normalize server-side via `POST /api/compute`
- **Layer toggle panel in Inspector**: only when user explicitly asks

## Design decisions
- Normalization: `round((value - min) / (max - min) * 100)` — 0=lowest cell, 100=peak overlap cell
- CSV format: 25×25 matrix, header row x1..x25, row 0 (top) = z25, row 24 (bottom) = z1
- `staleTime: 0` + `refetchOnWindowFocus: true` set in queryClient so DB pushes reflect immediately on refresh

**Why:** User wants full control over when ConTour UI appears. Build the plumbing first, expose UI only on explicit instruction.
