## Packages
@react-three/fiber | Core 3D library for React
@react-three/drei | Helpers for R3F (OrbitControls, Billboard, Text, Html)
three | Three.js core dependency
leva | For debugging/GUI controls if needed (optional but good for 3D tweaking)

## Notes
- The 3D scene requires a 25x25 grid.
- Backend provides `/api/segments` which returns a list of segments with xIndex, zIndex, value, etc.
- We need to map these to 3D boxes.
- "Billboards" will be used for labels to ensure they always face the camera, solving the user's specific problem.
