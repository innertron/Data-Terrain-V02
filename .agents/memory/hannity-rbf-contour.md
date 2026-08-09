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
  - r = 25 − Z  (so r=0=high income, r=24=low income)
- zIndex used internally: zIndex = 24 − r

## Hannity Control Points (X, Z, value)
```
# 0.54: (1,23),(10,22),(18,22),(25,23)
# 0.67: (1,20),(10,19),(18,19),(25,20)
# 0.84: (1,18),(10,17),(18,17),(25,18)
# 1.05: (1,15),(10,14),(18,15),(25,16)
# 1.31: (6,1),(10,3),(14,7),(18,11),(25,15)
# 1.64: (12,1),(16,4),(19,8),(22,12),(25,13.5)
# 2.05: (18,1),(20,3),(22,7),(25,12)
# 2.56: (22,1),(23,3),(24,7),(25,10.5)
# 3.20: (24.5,1),(25,4),(25,8),(25,9.5)
```

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
