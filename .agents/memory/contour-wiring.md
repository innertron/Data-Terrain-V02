---
name: ConTour wiring
description: State of the ConTour/layer system — what's built, what's deferred, and design decisions.
---

## What exists in code
- `client/src/lib/layers.ts` — LAYER_DEFS (3 layers), fetchLayerGrid(), computeLayerValues(); CSVs loaded at mount from client/public/
- `client/src/lib/demoContours.ts` — defines ConTourValue/ConTour types, 3 demo layers (Gaussian), `computeEffectiveValues()` (not wired to UI)
- `Landscape3D` / `Bar` / `SurfaceTerrain` / `FloatingLabel` — all accept `effectiveValues?: Map<string,number>`; wiring complete
- `SurfaceTerrain` — has edge-wall geometry: any perimeter cell with height > 0 gets a vertical wall down to y=0 in surf mode
- `Home.tsx` — LAYERS/DETAILS toggle in inspector; LAYERS mode shows layer list with per-layer toggles; toggling a layer recomputes terrain client-side instantly (no DB needed)

## Inspector layout (as of this session)
- Header: `px-3 py-1.5` (reduced from py-2)
- Domain/Income cards: `p-2.5` (reduced from p-3)
- Toggle (LAYERS/DETAILS) sits between segment cards and results area
- Layer list items: tiny grey uppercase text (`text-[10px] uppercase tracking-wider text-muted-foreground`), compact rows

## Layer CSV files (in client/public/)
- `/grid-circle.csv` — Layer 1: circle, center x13,z13, radius 7, values 9/10
- `/grid-layer2.csv` — Layer 2: quarter-circle from bottom-left, values 8/9/10
- `/grid-layer3.csv` — Layer 3: tilted diagonal ellipse, center ~x12/z13, angle 45°, values 9/10/11

## What was removed (per user instruction)
- ConTour panel from Inspector (Home.tsx) — removed 2026-08-01; user never authorized it

## Deferred features
- **Per-layer debug view**: admin/dev only; wiring ready, no UI
- **DB-backed layers table**: store layers as rows, compute sum+normalize server-side via `POST /api/compute`
- **Layer toggle panel in Inspector**: now built (client-side). DB-backed version deferred.
- **Axis labels from project settings**: AxisLabels component in Landscape3D still hardcoded

## Data / DB notes
- `grid_segments.value` range is 0-100 (normalized); DB currently has layer 2+3 combined values
- `staleTime: 0, gcTime: 0, cache: 'no-store'` on useSegments hook — always fetches fresh
- `effectiveValues` from layers overrides DB values entirely when any layer is active (client-side computation)
- Normalization: `round((value - min) / (max - min) * 100)` — 0=lowest cell, 100=peak

## Design decisions
- CSV format: 25×25 matrix, header row x1..x25, row 0 (top) = z25, row 24 (bottom) = z1
- Map key: `"${xIndex},${zIndex}"` (0-indexed)

**Why:** User wants full control over when layer UI appears. Build the plumbing first, expose UI only on explicit instruction.
