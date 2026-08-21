---
name: Terrain display transition lock
description: Approved rule for visually integrating zero edges and abrupt terrain steps without changing stored ViewerScore data.
---

The 25×25 display terrain must apply local transition blending after layer aggregation and normalization, before the bar/surface renderer receives its height map. Keep this display-only: stored layer grids, raw ViewerScores, API values, and their totals must not be modified by the visual correction.

**Why:** The user explicitly approved the resulting terrain. A zero boundary now becomes a gradual half-height entry step, and abrupt high/low seams are limited to a 15-point adjacent display-height difference. This removed the visible trenches and block-wall steps while preserving the underlying data.

**How to apply:** Do not remove, bypass, or duplicate the display transition helper when changing active-layer aggregation, normalization, terrain rendering, or client bundling. Before delivery, run the transition regression tests, type check, and verify the client aggregation path still feeds the blended 25×25 map into the 3D terrain. Distant zero regions and gradual slopes must remain unchanged.