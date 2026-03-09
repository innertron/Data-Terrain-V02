# DemoScape 4.0

## Overview
A full-stack 3D landscape visualization using a 25x25 grid where:
- **X-axis**: Political domains (DEM-4 through GOP-4)
- **Z-axis**: Income/Education levels (<$34K GED through $20B+ Luck2)
- **Y-axis (bar height)**: Population amounts

## Architecture
- **Frontend**: React + TypeScript with `@react-three/fiber` and `@react-three/drei` for 3D rendering
- **Backend**: Express.js API server
- **Database**: PostgreSQL with Drizzle ORM
- **Styling**: Tailwind CSS + shadcn/ui

## Key Features
- 625 grid segments (25x25) stored in PostgreSQL
- 3D bar chart visualization with orbit controls
- Billboard labels that always face the camera
- Dynamic axis label positioning that follows the camera angle (labels always appear on the side closest to the viewer)
- Color-coded bars: Blue (DEM) to Red (GOP) on X-axis
- Hover tooltips showing segment details
- Stars background and fog effects

## Important Files
- `client/src/components/Landscape3D.tsx` - Main 3D visualization component
- `shared/schema.ts` - Database schema (grid_segments table)
- `server/routes.ts` - API routes (GET /api/segments, PUT /api/segments/:id)
- `server/storage.ts` - Storage interface for CRUD operations
- `server/db.ts` - Database connection

## Technical Notes
- `<Billboard>` from drei ensures labels always face the camera
- Axis labels dynamically reposition based on camera.position.x and camera.position.z
- Bar colors use HSL with hue interpolated from 240 (blue/DEM) to 0 (red/GOP)
- Fog range: 30 to 120 units

## Packages
- `@react-three/fiber` ^8
- `@react-three/drei` ^9
- `three`
- `leva`
