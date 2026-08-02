---
name: Landscape3D camera setup
description: Correct initial camera position and z-axis label ordering in Landscape3D.tsx
---

## Correct initial camera position

`camera={{ position: [-25, 30, 25], fov: 45 }}` with `target={[0, 0, 0]}` on OrbitControls.

This places DEM-4 / <$34K GED at the bottom-front-center of the view — the desired default.

**Why:** Z_LABELS is ordered HIGH-to-LOW: index 0 = `$20B+ Luck2` (zPos = -12.5, negative z), index 24 = `<$34K GED` (zPos = +11.5, positive z). Camera must be at **positive z** to face the <$34K end. X_LABELS is ordered DEM-4 (index 0, xPos = -12.5) to GOP-4 (index 24, xPos = +11.5), so camera must be at **negative x** to face DEM-4. Combined: [-25, 30, +25].

**How to apply:** Any time the initial camera angle is reset or the Canvas is remounted, use this position. After changing camera props in code, a hard refresh (Cmd+Shift+R) is required — React Three Fiber only applies the `camera` prop on initial Canvas mount, not on HMR.
