---
name: Hannity RBF Contour Grid Generation
description: How to correctly generate 25×25 grid data from contour charts using RBF interpolation — the only correct approach.
---

## The Rule
Generate layer grids using **multiquadric RBF interpolation** from control points extracted along each contour line in the personality's chart. Mathematical approximations (product/additive models) do NOT match the contour chart and must not be used.

**Why:** The contour charts encode the actual research data. Any smooth polynomial approximation diverges immediately from the contour line shapes. The user's own Python code (scipy Rbf, multiquadric, smooth=0.2) is the reference implementation.

## Coordinate System Mapping
- Python/chart: X=1–25 (DEM→GOP), Z=1–25 (LOW income=1 at bottom, HIGH income=25 at top)
- My CSV grid: row r=0…24, col c=0…24
  - c = X − 1
  - **r = Z − 1  (row 0 = LOW income Z=1, row 24 = HIGH income Z=25)** — corrected 2026-08-10; the old note (r = 25 − Z) was inverted and put the peak at the wrong end.
- App display: zIndex = 24 − r, and Z_LABELS is HIGH→LOW, so row 0 → zIndex 24 → '<$34K GED'.

## Hannity Control Points (X, Z, value)
```
# 0.54: (1,23),(10,22),(18,22),(25,23)
# 0.67: (1,20),(10,19),(18,19),(25,20)
# 0.84: (1,18),(10,17),(18,17),(25,18)
# 1.05: (1,15),(10,14),(18,15),(25,16)
# 1.31: (6,1),(10,3),(14,7),(18,11),(25,15)
# 1.64: (12,1),(16,4),(19,8),(22,12),(25,13.5)
# 2.05: (18,1),(20,3),(22,7),(25,12.5)
# 2.56: (24.2,5),(24,7.5),(24.3,10.5),(25,13)   — hugs right edge, does NOT touch bottom
# 3.20: (25,8),(24.5,10.2),(25,12)
# anchors: 2.00 at (25,1),(23,1)                — kills RBF corner-overshoot bump
```

**FINAL working config (Aug 10 2026):** multiquadric φ=sqrt(r²+c²) with **c=2.5, smooth=0.1** (NOT c=1/0.2 — that rings badly on the steep 3.2→1.64 cliff at right edge Z12-15, producing spurious back-side bumps at Z15-17). Control points = list above PLUS interior bridges 2.30@(23.2,7.2), 2.35@(23.2,9), 2.30@(23,8). Do NOT densify contour polylines — dense exact-interpolation points ring worse. Validate every generated grid with: (1) local-maxima scan (only one peak allowed besides low corner mounds), (2) monotonic descent along right edge above the peak, (3) monotonic rise along rows approaching the peak.

**Overshoot lesson:** RBF extrapolation past the last bottom-edge control point creates a spurious second peak at the corner (user-visible bumps). Always add 1-2 low-value anchor points at unconstrained corners near the peak, then check for local maxima; also don't over-anchor (too many close anchors → oscillation).

**Correction (2026-08-10):** the user flagged that the original 3.2/2.56 points anchored the peak to the bottom-right corner. The chart's innermost contours are small CLOSED arcs at the right edge centered a bit below middle (peak ends up at X=25, Z≈8). When extracting future charts, check whether inner contours close around a center vs. run off the grid edge.

## RBF Implementation (JS, no scipy needed)
- Basis: φ(r) = sqrt(r² + 1²)  (multiquadric, ε=1)
- Smoothing: add 0.2 to diagonal before solve
- Solve NxN system with Gaussian elimination + partial pivoting
- Normalize heights 0–10 (same as Python), then scale total to 14.5M

## Key Shape Insight for Hannity
- Peak at LOW income (r=17-24, ~$35K-$200K) + far GOP (c=24)
- High income rows (r=0-8): flat and low across ALL political groups
- Contour lines sweep diagonally from bottom-right (peak) to upper-left
- NOT a bell curve in Z — monotonically higher viewership toward lower income + GOP

## Per-layer Workflow
For each of the 74 personalities:
1. User provides contour chart image (with 9 labeled values)
2. Extract control points by reading where each contour line passes through the grid cells
3. Run RBF interpolation in CodeExecution
4. Scale total to the personality's actual weekly viewers (in millions)
5. POST to /api/layers
