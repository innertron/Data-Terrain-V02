---
name: Layer CRUD operations
description: Exact commands to add, delete, and list layers in Data-Terrain-V02
---

## Add a layer
POST to the dev server with name, color (#a8d4d2 always), and a 25×25 CSV string (header row x1..x25 + 25 data rows):

```bash
CSV=$(cat /tmp/layer.csv)
curl -X POST http://localhost:5000/api/layers \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Layer Name\",\"color\":\"#a8d4d2\",\"csv\":$(echo "$CSV" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}"
```

Or generate the CSV inline with node and pipe directly.

## Add a layer from painted partition (preferred, Aug 18 2026)
```bash
node scripts/extract-partition.cjs <png> <7 bands comma-sep> | tail -1 > /tmp/pts.json
node scripts/new-layer.cjs /tmp/pts.json "Name" <totalM> <Affiliation> <Gender> "<Medium>" <rank> <iconPng> data/<slug>-trace-points.json "<method note>"
node scripts/sync-prod.js
```
Generates grid (auto monotone fix), rescales to EXACT total, inserts layer, saves trace file, patches icon/meta.

## Delete a layer
```bash
curl -X DELETE http://localhost:5000/api/layers/<id>
```

## List current layers
```bash
curl -s http://localhost:5000/api/layers | python3 -c "import json,sys; [print(f'id={l[\"id\"]} {l[\"name\"]}') for l in json.load(sys.stdin)]"
```

## CSV format
- Header: `x1,x2,...,x25`
- 25 data rows — **row 1 = LOW income (Z=1, <$34K), row 25 = HIGH income (Z=25, $20B+)**. The app renders zIndex = 24 − rowIndex against Z_LABELS which is HIGH→LOW. (2026-08-10: the previous note here said row 1 = Z25/top — that was WRONG and caused Hannity's peak to render at the high-income corner twice.)
- 25 comma-separated integers per row
- Values: outside = 4, inside = 5 (or as specified by user)

## Sidebar visibility
- Layers appear in the right Inspector sidebar under "Layers (N)"
- The sidebar uses `overflow-y-auto` — always scrollable
- `layerMode` defaults to `'layers'` so they're visible without any clicks

**Why:** Previously wasted time hunting for the API and debugging visibility. These are the exact working commands.
