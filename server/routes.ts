import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { initializeSegmentTables, getSegmentData, setSegmentData, getSegmentTotal } from "./segmentDb";
import { readFileSync } from "fs";
import { join } from "path";
import { pool } from "./db";

// ── Layer helpers ────────────────────────────────────────────────────────────

/**
 * Position-based hash noise — derives a value in [0,1) purely from (row,col,seed,idx).
 * No sequential state means zero correlation between adjacent cells; eliminates
 * the diagonal banding that sequential PRNGs (xorshift etc.) produce on a 2-D grid.
 */
function cellHash(row: number, col: number, seed: number, idx: number): number {
  let h = (seed ^ Math.imul(row, 1000003) ^ Math.imul(col, 999983) ^ Math.imul(idx, 998981));
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 0xFFFFFFFF;
}

/** Parse a 25×25 CSV (header + 25 rows) into a number[][] */
function parseCsvGrid(csvText: string): number[][] {
  return csvText.trim().split('\n').slice(1).map(l => l.split(',').map(Number));
}

/** Sum active grids and normalise 0-100 → plain object {[key]: value} */
function computeEffectiveValues(activeGrids: number[][][]): Record<string, number> {
  if (activeGrids.length === 0) return {};
  const sums: number[][] = [];
  let min = Infinity, max = -Infinity;
  for (let r = 0; r < 25; r++) {
    sums[r] = [];
    for (let c = 0; c < 25; c++) {
      const s = activeGrids.reduce((a, g) => a + (g[r]?.[c] ?? 0), 0);
      sums[r][c] = s;
      if (s < min) min = s;
      if (s > max) max = s;
    }
  }
  const spread = max - min;
  const result: Record<string, number> = {};
  for (let r = 0; r < 25; r++) {
    const zIndex = 24 - r;
    for (let c = 0; c < 25; c++) {
      const normalized = spread > 0 ? Math.round((sums[r][c] - min) / spread * 100) : 50;
      result[`${c},${zIndex}`] = normalized;
    }
  }
  return result;
}

/** Ensure the layers table exists — safe to call on every startup */
async function ensureLayersTable(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS layers (
        id      SERIAL PRIMARY KEY,
        name    TEXT    NOT NULL,
        color   TEXT    NOT NULL,
        grid_values TEXT NOT NULL,
        active  BOOLEAN NOT NULL DEFAULT true,
        params  TEXT
      )
    `);
    // Add params column to existing tables that predate this column
    await client.query(`
      ALTER TABLE layers ADD COLUMN IF NOT EXISTS params TEXT;
      ALTER TABLE layers ADD COLUMN IF NOT EXISTS name2 TEXT;
      ALTER TABLE layers ADD COLUMN IF NOT EXISTS description TEXT;
      ALTER TABLE layers ADD COLUMN IF NOT EXISTS icon TEXT
    `);
  } finally {
    client.release();
  }
}

/** Generate dome+arch grid values using position-based hash noise (no sequential PRNG) */
function generateDomeGrid(
  layerSeed: number,
  params: Record<string, number>
): number[][] {
  const applyNoise = (hBase: number, bot: number, top: number, row: number, col: number) => {
    const mag = bot + cellHash(row, col, layerSeed, 0) * (top - bot);
    const noise = cellHash(row, col, layerSeed, 1) > 0.5 ? mag : -mag;
    return Math.max(0, Math.round(hBase + noise));
  };
  const grid: number[][] = [];
  const { shape } = params as { shape?: string } & Record<string, number>;
  if (shape === 'ellipse') {
    // Off-center ellipse dome+arch. edist = sqrt((dx/rx)²+(dz/rz)²).
    // edist ≤ 1 → inside ellipse (dome up to hPeak); edist > 1 → outside (arch down to 0).
    const { cx, cz, rx, rz, hJunction, hPeak, dArch, insideBottom, insideTop, outsideBottom, outsideTop } = params;
    for (let row = 0; row < 25; row++) {
      const cols: number[] = [];
      const zIndex = 24 - row;
      for (let col = 0; col < 25; col++) {
        const edist = Math.sqrt(Math.pow((col - cx) / rx, 2) + Math.pow((zIndex - cz) / rz, 2));
        let hBase: number, bot: number, top: number;
        if (edist <= 1) {
          hBase = hJunction + (hPeak - hJunction) * Math.pow(1 - edist, 2);
          bot = insideBottom; top = insideTop;
        } else {
          hBase = hJunction * Math.pow(1 - Math.min((edist - 1) / dArch, 1), 2);
          bot = outsideBottom; top = outsideTop;
        }
        cols.push(applyNoise(hBase, bot, top, row, col));
      }
      grid.push(cols);
    }
  } else if (shape === 'valley') {
    // Parabolic bowl: valley floor at bottom-center, terrain rises toward top.
    // curveZ(col) = z0 + bowlCurve * ((col-cx)/cx)^2  — the parabola in zIndex space.
    // dist = zIndex - curveZ  → positive = above curve (high terrain), negative = inside valley.
    const { cx, z0, bowlCurve, hJunction, hPeak, dMax, dFloor, insideBottom, insideTop, outsideBottom, outsideTop } = params;
    for (let row = 0; row < 25; row++) {
      const cols: number[] = [];
      const zIndex = 24 - row;
      for (let col = 0; col < 25; col++) {
        const curveZ = z0 + bowlCurve * Math.pow((col - cx) / cx, 2);
        const dist = zIndex - curveZ;
        let hBase: number, bot: number, top: number;
        if (dist >= 0) {
          // Above valley curve — dome up to hPeak
          hBase = hJunction + (hPeak - hJunction) * Math.pow(Math.min(dist / dMax, 1), 2);
          bot = insideBottom; top = insideTop;
        } else {
          // Inside valley — arch down to 0
          hBase = hJunction * Math.pow(1 - Math.min(-dist / dFloor, 1), 2);
          bot = outsideBottom; top = outsideTop;
        }
        cols.push(applyNoise(hBase, bot, top, row, col));
      }
      grid.push(cols);
    }
  } else if (shape === 'rectangle') {
    const { x1, x2, row1, row2, hJunction, hPeak, maxDin, dMax, insideBottom, insideTop, outsideBottom, outsideTop } = params;
    for (let row = 0; row < 25; row++) {
      const cols: number[] = [];
      for (let col = 0; col < 25; col++) {
        const insideRect = row >= row1 && row <= row2 && col >= x1 && col <= x2;
        let hBase: number, bot: number, top: number;
        if (insideRect) {
          const dIn = Math.min(row - row1, row2 - row, col - x1, x2 - col);
          hBase = hJunction + (hPeak - hJunction) * Math.pow(dIn / maxDin, 2);
          bot = insideBottom; top = insideTop;
        } else {
          const dx = Math.max(x1 - col, 0, col - x2);
          const dz = Math.max(row1 - row, 0, row - row2);
          hBase = hJunction * Math.pow(1 - Math.min(Math.sqrt(dx*dx+dz*dz) / dMax, 1), 2);
          bot = outsideBottom; top = outsideTop;
        }
        cols.push(applyNoise(hBase, bot, top, row, col));
      }
      grid.push(cols);
    }
  } else {
    // circle
    const { cx, cz, r, hJunction, hPeak, dMax, insideBottom, insideTop, outsideBottom, outsideTop } = params;
    for (let row = 0; row < 25; row++) {
      const cols: number[] = [];
      for (let col = 0; col < 25; col++) {
        const dx = col - cx, dz = (24 - row) - cz;
        const d = Math.sqrt(dx*dx + dz*dz);
        let hBase: number, bot: number, top: number;
        if (d <= r) {
          hBase = hJunction + (hPeak - hJunction) * (1 - Math.pow(d/r, 2));
          bot = insideBottom; top = insideTop;
        } else {
          hBase = hJunction * Math.pow(1 - Math.min((d-r)/(dMax-r), 1), 2);
          bot = outsideBottom; top = outsideTop;
        }
        cols.push(applyNoise(hBase, bot, top, row, col));
      }
      grid.push(cols);
    }
  }
  return grid;
}

// Distinct seeds per layer — keeps each layer's noise independent of the other
const LAYER_SEEDS: Record<string, number> = {
  circle:    0xCAFEBABE,
  rectangle: 0xDEADBEEF,
  valley:    0xBEEFCAFE,
  ellipse:   0xF00DCAFE,
};

/** Canonical layer definitions — add new layers here only. */
const LAYER_DEFINITIONS = [
  {
    name: 'Layer 1 — Circle',
    color: '#a8d4d2',
    params: { shape: 'circle', cx: 12, cz: 12, r: 7, hJunction: 40, hPeak: 100, dMax: 17, insideBottom: 0, insideTop: 5, outsideBottom: 0, outsideTop: 5 },
  },
  {
    name: 'Layer 2 — Rectangle',
    color: '#a8d4d2',
    params: { shape: 'rectangle', x1: 6, x2: 18, row1: 7, row2: 19, hJunction: 40, hPeak: 100, maxDin: 6, dMax: 9.22, insideBottom: 0, insideTop: 5, outsideBottom: 0, outsideTop: 5 },
  },
  {
    name: 'Layer 3 — Valley',
    color: '#a8d4d2',
    params: { shape: 'valley', cx: 12, z0: 3, bowlCurve: 9, hJunction: 40, hPeak: 100, dMax: 12, dFloor: 5, insideBottom: 0, insideTop: 5, outsideBottom: 0, outsideTop: 3 },
  },
  {
    name: 'Layer 4 — Ellipse',
    color: '#a8d4d2',
    params: { shape: 'ellipse', cx: 4, cz: 16, rx: 7, rz: 9, hJunction: 40, hPeak: 100, dArch: 2.5, insideBottom: 0, insideTop: 5, outsideBottom: 0, outsideTop: 4 },
  },
];

/** Inserts any layer definitions that do not yet exist in the DB (by name).
 *  Never overwrites existing rows — preserves any Adjust Skew changes. */
async function seedLayers() {
  const existing = await storage.getLayers();
  const existingNames = new Set(existing.map(l => l.name));

  const toInsert = LAYER_DEFINITIONS.filter(d => !existingNames.has(d.name));
  if (toInsert.length === 0) return;

  const records = toInsert.map(d => ({
    name: d.name,
    color: d.color,
    active: true,
    params: JSON.stringify(d.params),
    gridValues: JSON.stringify(generateDomeGrid(
      LAYER_SEEDS[d.params.shape] ?? 0xCAFEBABE,
      d.params as unknown as Record<string, number>
    )),
  }));
  await storage.bulkInsertLayers(records);
  console.log(`Seeded ${records.length} new layer(s): ${records.map(r => r.name).join(', ')}`);
}

const segmentDataRowSchema = z.object({
  response_category: z.string().min(1),
  count: z.number().int().min(0),
});

const uploadDataSchema = z.object({
  rows: z.array(segmentDataRowSchema).min(1),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Initialize all 625 segment data tables
  await initializeSegmentTables();

  // Ensure layers table exists (safe on every restart)
  await ensureLayersTable();

  // Always run seedLayers — it inserts on first run, refreshes gridValues
  // (with improved hash-based noise) on subsequent runs. Cost is trivial.
  await seedLayers();
  await storage.setSetting('layers_seeded', '1');

  // ── Layer routes ────────────────────────────────────────────────────────────

  // GET /api/layers — return all layers with parsed grid data
  app.get("/api/layers", async (_req, res) => {
    try {
      const rows = await storage.getLayers();
      const result = rows.map(r => ({
        id: r.id,
        name: r.name,
        name2: r.name2 ?? null,
        description: r.description ?? null,
        icon: r.icon ?? null,
        color: r.color,
        active: r.active,
        gridValues: JSON.parse(r.gridValues) as number[][],
        params: r.params ?? null,
      }));
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch layers" });
    }
  });

  // POST /api/layers — add a new layer from CSV text
  const newLayerSchema = z.object({
    name: z.string().min(1),
    color: z.string().min(1),
    csv: z.string().min(1),
  });

  app.post("/api/layers", async (req, res) => {
    try {
      const { name, color, csv } = newLayerSchema.parse(req.body);
      const grid = parseCsvGrid(csv);
      if (grid.length !== 25 || grid.some(r => r.length !== 25)) {
        return res.status(400).json({ message: "CSV must be a 25×25 grid (header + 25 rows, 25 columns each)" });
      }
      const layer = await storage.createLayer({
        name,
        color,
        gridValues: JSON.stringify(grid),
        active: true,
      });
      res.status(201).json({ id: layer.id, name: layer.name, color: layer.color, active: layer.active, gridValues: grid });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      console.error(err);
      res.status(500).json({ message: "Failed to create layer" });
    }
  });

  // PATCH /api/layers/:id — toggle active flag
  app.patch("/api/layers/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { active } = z.object({ active: z.boolean() }).parse(req.body);
      const updated = await storage.updateLayerActive(id, active);
      const grid = JSON.parse(updated.gridValues) as number[][];
      res.json({ id: updated.id, name: updated.name, color: updated.color, active: updated.active, gridValues: grid });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      console.error(err);
      res.status(500).json({ message: "Failed to update layer" });
    }
  });

  // PATCH /api/layers/:id/rename — update layer meta (name, name2, description, icon)
  app.patch("/api/layers/:id/rename", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const body = z.object({
        name: z.string().min(1).optional(),
        name2: z.string().max(20).optional(),
        description: z.string().max(200).optional(),
        icon: z.string().refine(
          v => v === undefined || v.startsWith('data:image/jpeg;base64,') || v.startsWith('data:image/png;base64,'),
          { message: 'Icon must be a JPG or PNG data URL' }
        ).optional(),
      }).parse(req.body);
      const updated = await storage.updateLayerMeta(id, body);
      res.json({ id: updated.id, name: updated.name, name2: updated.name2, description: updated.description, icon: updated.icon });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      console.error(err);
      res.status(500).json({ message: "Failed to update layer" });
    }
  });

  // DELETE /api/layers/:id
  app.delete("/api/layers/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteLayer(id);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to delete layer" });
    }
  });

  // POST /api/layers/:id/skew — regenerate layer gridValues with new randomness bounds
  app.post("/api/layers/:id/skew", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const layer = await storage.getLayer(id);
      if (!layer) return res.status(404).json({ message: "Layer not found" });

      const skewSchema = z.object({
        insideBottom:  z.number().min(0),
        insideTop:     z.number().min(0),
        outsideBottom: z.number().min(0),
        outsideTop:    z.number().min(0),
      });
      const { insideBottom, insideTop, outsideBottom, outsideTop } = skewSchema.parse(req.body);

      // Position-based noise — no sequential state, no diagonal artifacts
      const layerSeed = id * 0x9e3779b9;
      const applyNoise = (hBase: number, bot: number, top: number, row: number, col: number): number => {
        const magnitude = bot + cellHash(row, col, layerSeed, 0) * (top - bot);
        const noise = cellHash(row, col, layerSeed, 1) > 0.5 ? magnitude : -magnitude;
        return Math.max(0, Math.round(hBase + noise));
      };

      let grid: number[][];
      let newParams: string;

      if (!layer.params) {
        // No shape params — add noise to each existing cell value.
        // Uses outsideBottom/outsideTop as the noise range for all cells.
        const existing = JSON.parse(layer.gridValues) as number[][];
        grid = existing.map((rowArr, r) =>
          rowArr.map((val, c) => applyNoise(val, outsideBottom, outsideTop, r, c))
        );
        newParams = JSON.stringify({ insideBottom, insideTop, outsideBottom, outsideTop });
      } else {
        // Shape params exist — regenerate from scratch using stored algorithm.
        const p = JSON.parse(layer.params);
        const { hJunction, hPeak } = p;
        grid = [];

        if (p.shape === 'ellipse') {
          const { cx, cz, rx, rz, hJunction, hPeak, dArch } = p;
          for (let row = 0; row < 25; row++) {
            const cols: number[] = [];
            const zIndex = 24 - row;
            for (let col = 0; col < 25; col++) {
              const edist = Math.sqrt(Math.pow((col - cx) / rx, 2) + Math.pow((zIndex - cz) / rz, 2));
              let hBase: number, bot: number, top: number;
              if (edist <= 1) {
                hBase = hJunction + (hPeak - hJunction) * Math.pow(1 - edist, 2);
                bot = insideBottom; top = insideTop;
              } else {
                hBase = hJunction * Math.pow(1 - Math.min((edist - 1) / dArch, 1), 2);
                bot = outsideBottom; top = outsideTop;
              }
              cols.push(applyNoise(hBase, bot, top, row, col));
            }
            grid.push(cols);
          }
        } else if (p.shape === 'valley') {
          const { cx, z0, bowlCurve, hJunction, hPeak, dMax, dFloor } = p;
          for (let row = 0; row < 25; row++) {
            const cols: number[] = [];
            const zIndex = 24 - row;
            for (let col = 0; col < 25; col++) {
              const curveZ = z0 + bowlCurve * Math.pow((col - cx) / cx, 2);
              const dist = zIndex - curveZ;
              let hBase: number, bot: number, top: number;
              if (dist >= 0) {
                hBase = hJunction + (hPeak - hJunction) * Math.pow(Math.min(dist / dMax, 1), 2);
                bot = insideBottom; top = insideTop;
              } else {
                hBase = hJunction * Math.pow(1 - Math.min(-dist / dFloor, 1), 2);
                bot = outsideBottom; top = outsideTop;
              }
              cols.push(applyNoise(hBase, bot, top, row, col));
            }
            grid.push(cols);
          }
        } else if (p.shape === 'rectangle') {
          // Rectangle: dome inside, arch outside, distance-to-boundary based
          const { x1, x2, row1, row2, maxDin, dMax } = p;
          for (let row = 0; row < 25; row++) {
            const cols: number[] = [];
            for (let col = 0; col < 25; col++) {
              const insideRect = row >= row1 && row <= row2 && col >= x1 && col <= x2;
              let hBase: number, bot: number, top: number;
              if (insideRect) {
                const dIn = Math.min(row - row1, row2 - row, col - x1, x2 - col);
                const t = dIn / maxDin;
                hBase = hJunction + (hPeak - hJunction) * (t * t);
                bot = insideBottom; top = insideTop;
              } else {
                const dx = Math.max(x1 - col, 0, col - x2);
                const dz = Math.max(row1 - row, 0, row - row2);
                const dOut = Math.sqrt(dx * dx + dz * dz);
                const t = Math.min(dOut / dMax, 1);
                hBase = hJunction * Math.pow(1 - t, 2);
                bot = outsideBottom; top = outsideTop;
              }
              cols.push(applyNoise(hBase, bot, top, row, col));
            }
            grid.push(cols);
          }
        } else {
          // Default: circle dome+arch algorithm
          const { cx, cz, r, dMax } = p;
          for (let row = 0; row < 25; row++) {
            const cols: number[] = [];
            for (let col = 0; col < 25; col++) {
              const dx = col - cx, dz = (24 - row) - cz;
              const d = Math.sqrt(dx * dx + dz * dz);
              let hBase: number, bot: number, top: number;
              if (d <= r) {
                const t = d / r;
                hBase = hJunction + (hPeak - hJunction) * (1 - t * t);
                bot = insideBottom; top = insideTop;
              } else {
                const t = Math.min((d - r) / (dMax - r), 1);
                hBase = hJunction * Math.pow(1 - t, 2);
                bot = outsideBottom; top = outsideTop;
              }
              cols.push(applyNoise(hBase, bot, top, row, col));
            }
            grid.push(cols);
          }
        }
        newParams = JSON.stringify({ ...p, insideBottom, insideTop, outsideBottom, outsideTop });
      }
      const updated = await storage.updateLayerGridValues(id, JSON.stringify(grid), newParams);
      const parsedGrid = JSON.parse(updated.gridValues) as number[][];
      res.json({ id: updated.id, name: updated.name, color: updated.color, active: updated.active, gridValues: parsedGrid, params: updated.params });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      console.error(err);
      res.status(500).json({ message: "Failed to apply skew" });
    }
  });

  // POST /api/layers/compute — sum all active layers, normalise 0-100, return map
  app.post("/api/layers/compute", async (_req, res) => {
    try {
      const rows = await storage.getLayers();
      const activeGrids = rows
        .filter(r => r.active)
        .map(r => JSON.parse(r.gridValues) as number[][]);
      const effectiveValues = computeEffectiveValues(activeGrids);
      res.json({ effectiveValues });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to compute effective values" });
    }
  });

  // Seeding logic
  const existingSegments = await storage.getGridSegments();
  if (existingSegments.length === 0) {
    console.log("Seeding DemoScape grid...");
    const segments = [];
    const gridSize = 25;

    const getXLabel = (i: number) => {
      if (i < 4) return "Far Left";
      if (i < 8) return "Left";
      if (i < 11) return "Center-Left";
      if (i === 12) return "Center";
      if (i < 16) return "Center-Right";
      if (i < 20) return "Right";
      return "Far Right";
    };

    const getZLabel = (i: number) => {
      if (i < 5) return "Low Income/Edu";
      if (i < 10) return "Working Class";
      if (i < 15) return "Middle Class";
      if (i < 20) return "Upper Middle";
      return "High Income/Elite";
    };

    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        const dx = x - 12;
        const dz = z - 12;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const baseValue = Math.max(10, 100 * Math.exp(-(dist * dist) / 50)); 
        const randomValue = Math.floor(Math.random() * 20);
        
        segments.push({
          xIndex: x,
          zIndex: z,
          xLabel: getXLabel(x),
          zLabel: getZLabel(z),
          value: Math.floor(baseValue + randomValue),
          description: `Segment [${x},${z}]`,
        });
      }
    }
    await storage.initializeGrid(segments);
    console.log("DemoScape grid seeded!");
  }

  // GET all segments (for the landscape)
  app.get(api.segments.list.path, async (req, res) => {
    const segments = await storage.getGridSegments();
    res.json(segments);
  });

  // PUT update a segment's value manually
  app.put(api.segments.update.path, async (req, res) => {
    try {
      const input = api.segments.update.input.parse(req.body);
      const updated = await storage.updateGridSegment(Number(req.params.id), input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET data rows for a specific segment's dedicated table
  app.get("/api/segments/:id/data", async (req, res) => {
    try {
      const segmentId = Number(req.params.id);
      if (isNaN(segmentId) || segmentId < 1 || segmentId > 625) {
        return res.status(400).json({ message: "Invalid segment ID (must be 1–625)" });
      }
      const rows = await getSegmentData(segmentId);
      const total = rows.reduce((sum, r) => sum + r.count, 0);
      res.json({ segmentId, rows, total });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch segment data" });
    }
  });

  // POST upload CSV data (as JSON rows) to a segment's dedicated table
  app.post("/api/segments/:id/data", async (req, res) => {
    try {
      const segmentId = Number(req.params.id);
      if (isNaN(segmentId) || segmentId < 1 || segmentId > 625) {
        return res.status(400).json({ message: "Invalid segment ID (must be 1–625)" });
      }
      const { rows } = uploadDataSchema.parse(req.body);
      const total = await setSegmentData(segmentId, rows);
      // Update the grid_segments.value so bar height reflects the new data
      await storage.updateGridSegment(segmentId, { value: total });
      res.json({ segmentId, total, rowCount: rows.length });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error(err);
      res.status(500).json({ message: "Failed to upload segment data" });
    }
  });

  // GET all project settings
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getAllSettings();
      res.json(settings);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  // PUT upsert a single setting
  app.put("/api/settings/:key", async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = z.object({ value: z.string() }).parse(req.body);
      await storage.setSetting(key, value);
      res.json({ key, value });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Failed to save setting" });
    }
  });

  return httpServer;
}
