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


// ── FANS layer migration data ───────────────────────────────────────────────
const FANS_MIGRATION_DATA = [
      {
            "name": "FANS I",
            "name2": "TEST !",
            "description": "this is a test for the detail text. This is showing the details. his is showing the details. his is showing the details.",
            "icon": "data:image/jpeg;base64,/9j/4QAYRXhpZgAASUkqAAgAAAAAAAAAAAAAAP/sABFEdWNreQABAAQAAAA6AAD/4QMyaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLwA8P3hwYWNrZXQgYmVnaW49Iu+7vyIgaWQ9Ilc1TTBNcENlaGlIenJlU3pOVGN6a2M5ZCI/PiA8eDp4bXBtZXRhIHhtbG5zOng9ImFkb2JlOm5zOm1ldGEvIiB4OnhtcHRrPSJBZG9iZSBYTVAgQ29yZSAxMC4wLWMwMDAgNzkuZDIwZTQ2NjMwLCAyMDI1LzEyLzA5LTAyOjExOjIzICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIiB4bWxuczpzdFJlZj0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL3NUeXBlL1Jlc291cmNlUmVmIyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgMjcuOSAoTWFjaW50b3NoKSIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDo0MDU3MTA4Mzg5NTExMUYxOTNCQTlEM0EzRkQ3MEVGOCIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDo0MDU3MTA4NDg5NTExMUYxOTNCQTlEM0EzRkQ3MEVGOCI+IDx4bXBNTTpEZXJpdmVkRnJvbSBzdFJlZjppbnN0YW5jZUlEPSJ4bXAuaWlkOjQwNTcxMDgxODk1MTExRjE5M0JBOUQzQTNGRDcwRUY4IiBzdFJlZjpkb2N1bWVudElEPSJ4bXAuZGlkOjQwNTcxMDgyODk1MTExRjE5M0JBOUQzQTNGRDcwRUY4Ii8+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+/+4ADkFkb2JlAGTAAAAAAf/bAIQABwUFBQUFBwUFBwoG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",
            "grid_values": "[[4,0,0,6,7,8,9,2,12,13,5,14,14,14,13,5,4,2,9,8,0,6,5,4,0],[0,0,6,7,1,2,12,6,15,17,10,18,10,18,18,17,15,14,4,2,1,7,6,5,0],[0,6,7,9,3,13,7,10,20,13,15,23,24,23,23,21,20,10,7,5,3,1,7,6,0],[6,0,9,3,14,17,11,14,24,19,28,21,30,21,20,27,24,14,11,17,6,11,9,0,0],[0,1,3,14,17,20,24,19,30,33,27,36,36,28,35,33,30,27,24,12,17,6,3,1,0],[0,10,13,9,20,16,20,32,36,31,34,43,44,35,42,39,36,24,28,24,20,17,5,10,8],[9,12,7,11,16,20,33,38,42,45,57,55,58,59,48,49,42,30,25,20,16,19,7,4,9],[10,14,10,14,27,32,38,35,54,59,68,72,70,68,61,62,46,43,30,32,27,14,10,6,2],[12,7,20,24,30,28,42,50,61,72,73,80,77,85,79,74,60,56,42,28,22,16,20,15,12],[5,17,21,27,25,39,40,59,72,74,81,87,90,83,83,75,71,53,44,31,33,27,21,17,5],[5,18,15,28,35,42,56,61,71,81,93,88,95,90,87,84,75,70,56,42,35,28,15,10,13],[14,10,15,21,28,35,58,63,81,88,97,102,96,92,96,85,77,62,58,35,36,29,15,18,14],[14,10,16,22,36,40,59,74,85,85,95,98,106,98,93,86,79,74,61,43,28,22,16,18,14],[14,10,23,29,36,43,61,66,75,84,98,93,93,96,100,91,77,67,56,35,28,21,15,10,6],[13,18,23,20,35,42,49,69,80,87,93,94,92,96,87,80,72,59,53,42,35,20,23,10,13],[5,9,13,19,33,39,41,63,70,76,85,83,94,82,88,78,72,60,49,31,33,27,21,17,13],[4,7,20,24,30,36,42,47,62,70,77,78,75,78,75,71,64,55,34,36,22,16,20,7,4],[10,14,10,22,27,32,30,35,50,62,59,68,70,73,61,58,44,43,38,24,27,22,10,6,10],[1,4,7,11,16,28,33,38,34,42,53,52,54,52,53,48,42,30,33,20,24,19,7,12,9],[8,2,13,9,12,16,28,24,28,39,34,43,38,43,42,39,28,32,20,16,20,17,13,2,0],[7,9,3,14,9,20,24,19,30,33,35,28,28,28,35,33,30,19,16,12,17,14,11,1,0],[6,7,9,11,14,17,11,14,24,27,20,21,30,29,20,19,24,22,19,17,14,11,9,7,6],[5,6,0,1,11,5,15,18,12,21,15,15,24,15,15,21,12,10,7,13,3,1,0,6,0],[4,0,0,7,1,10,12,6,15,9,18,18,10,10,18,9,7,14,12,2,9,0,0,0,4],[4,0,5,0,7,0,1,2,4,13,5,6,14,6,5,13,4,10,1,0,7,0,0,4,0]]",
            "params": "{\"shape\":\"circle\",\"cx\":12,\"cz\":12,\"r\":7,\"hJunction\":40,\"hPeak\":100,\"dMax\":17,\"insideBottom\":6,\"insideTop\":0,\"outsideBottom\":4,\"outsideTop\":4}",
            "prodId": 4
      },
      {
            "name": "FANS II:",
            "name2": "1st World Cup:",
            "description": "These fans were at their fist world cup expected to like it and liked it. this is a test for the detail text. This is showing the details. his is showing the details. his is showing the details.",
            "icon": "data:image/jpeg;base64,/9j/4QAYRXhpZgAASUkqAAgAAAAAAAAAAAAAAP/sABFEdWNreQABAAQAAAA6AAD/4QMyaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLwA8P3hwYWNrZXQgYmVnaW49Iu+7vyIgaWQ9Ilc1TTBNcENlaGlIenJlU3pOVGN6a2M5ZCI/PiA8eDp4bXBtZXRhIHhtbG5zOng9ImFkb2JlOm5zOm1ldGEvIiB4OnhtcHRrPSJBZG9iZSBYTVAgQ29yZSAxMC4wLWMwMDAgNzkuZDIwZTQ2NjMwLCAyMDI1LzEyLzA5LTAyOjExOjIzICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIiB4bWxuczpzdFJlZj0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL3NUeXBlL1Jlc291cmNlUmVmIyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgMjcuOSAoTWFjaW50b3NoKSIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDo0MDU3MTA4Nzg5NTExMUYxOTNCQTlEM0EzRkQ3MEVGOCIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDo0MDU3MTA4ODg5NTExMUYxOTNCQTlEM0EzRkQ3MEVGOCI+IDx4bXBNTTpEZXJpdmVkRnJvbSBzdFJlZjppbnN0YW5jZUlEPSJ4bXAuaWlkOjQwNTcxMDg1ODk1MTExRjE5M0JBOUQzQTNGRDcwRUY4IiBzdFJlZjpkb2N1bWVudElEPSJ4bXAuZGlkOjQwNTcxMDg2ODk1MTExRjE5M0JBOUQzQTNGRDcwRUY4Ii8+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+/+4ADkFkb2JlAGTAAAAAAf/bAIQABwUFBQUFBwUFBwoG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",
            "grid_values": "[[0,0,0,7,0,0,0,7,8,8,0,0,0,8,0,0,0,0,0,7,0,0,5,5,5],[6,7,0,8,10,0,9,1,10,1,0,10,0,0,10,1,0,11,0,9,0,0,0,6,0],[5,0,9,10,2,3,2,2,13,4,14,3,14,4,13,13,13,3,3,13,2,0,8,0,6],[0,0,1,4,5,6,8,9,8,7,8,18,8,8,7,18,8,19,8,17,6,3,0,8,6],[0,10,13,16,9,22,13,14,22,22,13,12,13,24,12,24,24,13,13,22,20,6,14,0,0],[9,3,17,19,25,27,30,20,30,20,20,29,19,29,20,20,30,19,30,28,25,20,6,2,9],[9,12,8,13,28,25,26,38,36,26,36,27,26,28,27,37,37,27,38,33,17,12,8,4,10],[0,14,17,24,30,27,31,35,43,31,38,42,44,40,49,46,33,42,43,26,20,13,8,14,9],[9,3,17,13,30,36,46,40,38,33,50,39,47,45,48,33,49,48,40,27,30,13,7,13,9],[11,3,7,24,30,26,34,43,39,45,42,52,41,41,45,52,43,36,39,37,20,13,18,12,1],[0,4,17,13,20,26,35,33,40,59,63,58,63,56,47,47,39,35,34,36,20,24,18,4,9],[0,14,8,13,19,27,46,41,50,51,75,74,70,70,64,51,39,46,39,27,19,13,17,14,0],[9,14,17,14,29,26,35,45,43,50,71,89,83,76,76,53,42,34,39,37,30,23,19,4,0],[9,13,18,13,29,37,32,37,38,53,64,75,97,76,59,55,46,42,39,27,30,12,17,3,0],[10,14,18,22,30,27,40,36,49,48,65,87,77,82,72,62,41,37,43,27,29,23,8,14,0],[10,13,17,22,20,36,40,45,52,51,64,69,74,67,67,57,50,48,32,27,19,13,18,3,9],[0,13,9,14,30,36,44,34,41,59,60,49,50,59,49,55,48,37,48,36,30,14,8,3,9],[9,4,7,13,20,38,31,33,40,54,45,40,51,39,51,44,44,46,35,28,20,23,18,13,10],[0,14,18,24,30,37,38,44,36,44,34,36,45,33,39,35,45,50,33,27,31,13,7,4,0],[0,13,18,14,19,27,48,44,36,44,41,43,35,32,43,44,43,37,35,27,30,14,18,14,1],[0,14,7,22,28,33,37,36,26,26,26,38,36,36,26,38,26,27,37,35,27,23,8,2,10],[0,1,15,20,14,27,20,29,29,30,29,29,19,19,30,30,29,30,29,19,15,11,15,1,10],[0,0,14,16,20,13,23,13,23,12,23,23,24,13,14,23,13,24,23,23,20,7,14,1,8],[6,9,11,4,6,18,8,18,17,9,7,7,18,18,18,8,7,17,7,16,15,3,10,9,6],[5,6,0,10,12,12,13,4,13,14,3,14,13,13,3,3,3,13,13,14,12,11,0,0,7]]",
            "params": "{\"shape\":\"rectangle\",\"x1\":6,\"x2\":18,\"row1\":7,\"row2\":19,\"hJunction\":40,\"hPeak\":100,\"maxDin\":6,\"dMax\":9.22,\"insideBottom\":0,\"insideTop\":9,\"outsideBottom\":6,\"outsideTop\":4}",
            "prodId": 5
      },
      {
            "name": "FANS III:",
            "name2": "NEVER",
            "description": "this is a test for the detail text. This is showing the details. his is showing the details. his is showing the details.",
            "icon": "data:image/jpeg;base64,/9j/4QAYRXhpZgAASUkqAAgAAAAAAAAAAAAAAP/sABFEdWNreQABAAQAAAA6AAD/4QMyaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLwA8P3hwYWNrZXQgYmVnaW49Iu+7vyIgaWQ9Ilc1TTBNcENlaGlIenJlU3pOVGN6a2M5ZCI/PiA8eDp4bXBtZXRhIHhtbG5zOng9ImFkb2JlOm5zOm1ldGEvIiB4OnhtcHRrPSJBZG9iZSBYTVAgQ29yZSAxMC4wLWMwMDAgNzkuZDIwZTQ2NjMwLCAyMDI1LzEyLzA5LTAyOjExOjIzICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIiB4bWxuczpzdFJlZj0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL3NUeXBlL1Jlc291cmNlUmVmIyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgMjcuOSAoTWFjaW50b3NoKSIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDo5MDRGRUM5Mjg5NTExMUYxOTNCQTlEM0EzRkQ3MEVGOCIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDo5MDRGRUM5Mzg5NTExMUYxOTNCQTlEM0EzRkQ3MEVGOCI+IDx4bXBNTTpEZXJpdmVkRnJvbSBzdFJlZjppbnN0YW5jZUlEPSJ4bXAuaWlkOjQwNTcxMDg5ODk1MTExRjE5M0JBOUQzQTNGRDcwRUY4IiBzdFJlZjpkb2N1bWVudElEPSJ4bXAuZGlkOjQwNTcxMDhBODk1MTExRjE5M0JBOUQzQTNGRDcwRUY4Ii8+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+/+4ADkFkb2JlAGTAAAAAAf/bAIQABwUFBQUFBwUFBwoG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",
            "grid_values": "[[107,93,106,107,93,106,93,92,92,92,107,92,94,93,107,94,93,107,107,92,93,93,93,92,93],[83,106,107,93,93,106,93,93,107,93,94,106,92,93,93,93,107,108,92,106,108,108,93,107,84],[74,102,93,93,92,106,106,107,106,106,108,93,108,106,108,107,107,93,106,108,94,92,92,102,89],[67,78,104,92,106,107,92,93,94,94,92,107,107,93,94,92,106,107,107,94,108,93,90,93,81],[75,83,82,93,107,107,92,108,92,94,94,107,93,107,93,92,94,94,93,94,108,106,81,85,74],[54,78,86,82,107,107,94,93,107,92,94,107,107,94,106,94,107,108,107,92,107,97,87,63,68],[63,56,78,87,97,92,92,93,92,107,93,93,93,93,106,106,107,93,107,107,84,74,65,69,48],[43,65,71,67,74,97,90,107,93,94,93,107,93,93,92,93,94,93,91,83,74,81,71,65,57],[40,46,66,73,82,74,95,101,93,107,94,93,107,107,93,94,107,87,82,87,81,73,67,60,54],[52,55,46,67,74,80,87,78,84,87,105,92,92,92,105,88,98,79,72,66,73,53,62,42,50],[48,52,57,48,54,73,80,69,75,93,81,82,83,97,82,78,75,85,66,73,54,61,57,53,49],[34,50,54,57,48,66,72,77,80,70,72,73,89,75,88,84,81,62,57,53,48,44,53,35,48],[34,48,37,53,57,61,52,57,60,63,65,80,81,66,79,62,60,70,67,48,43,53,51,33,48],[19,47,49,51,54,42,46,63,54,70,57,73,74,74,72,55,53,51,62,58,40,51,34,48,32],[22,25,47,34,50,54,56,59,48,51,67,67,68,53,67,64,62,46,41,40,51,35,33,39,9],[13,11,29,47,34,37,53,41,43,45,62,49,61,63,61,45,56,56,39,51,49,34,43,11,1],[9,2,29,45,33,35,50,39,40,55,57,42,44,57,55,55,40,39,51,48,46,32,15,17,7],[0,8,6,18,47,47,35,35,37,52,52,40,53,39,39,38,51,50,34,47,34,18,20,0,0],[6,0,10,7,18,33,33,35,34,36,49,37,50,37,36,49,49,35,47,32,32,19,12,7,0],[6,0,9,0,21,31,29,47,47,48,35,48,49,49,34,34,33,32,44,18,20,0,7,7,0],[0,6,0,7,14,21,29,26,46,48,47,48,47,47,33,33,32,39,30,20,0,7,7,0,7],[0,0,0,0,9,0,6,12,32,37,30,33,32,47,42,39,19,26,7,13,9,6,6,0,6],[6,0,0,0,0,9,0,17,8,27,30,30,18,19,28,13,21,15,0,8,6,0,7,0,0],[6,0,0,0,0,6,0,0,14,2,18,20,21,21,5,2,0,8,8,0,7,6,6,0,0],[7,6,6,6,0,0,7,0,0,10,11,14,1,12,0,8,7,0,0,0,0,0,0,0,7]]",
            "params": "{\"shape\":\"valley\",\"cx\":12,\"z0\":3,\"bowlCurve\":9,\"hJunction\":40,\"hPeak\":100,\"dMax\":12,\"dFloor\":5,\"insideBottom\":6,\"insideTop\":8,\"outsideBottom\":5,\"outsideTop\":8}",
            "prodId": 6
      },
      {
            "name": "FANS IV:",
            "name2": "Oh YEAH!",
            "description": "this is a test for the detail text. This is showing the details. his is showing the details. his is showing the details. this is a test for the detail text. This is showing the details. his is showing",
            "icon": "data:image/jpeg;base64,/9j/4QAYRXhpZgAASUkqAAgAAAAAAAAAAAAAAP/sABFEdWNreQABAAQAAAA6AAD/4QMyaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLwA8P3hwYWNrZXQgYmVnaW49Iu+7vyIgaWQ9Ilc1TTBNcENlaGlIenJlU3pOVGN6a2M5ZCI/PiA8eDp4bXBtZXRhIHhtbG5zOng9ImFkb2JlOm5zOm1ldGEvIiB4OnhtcHRrPSJBZG9iZSBYTVAgQ29yZSAxMC4wLWMwMDAgNzkuZDIwZTQ2NjMwLCAyMDI1LzEyLzA5LTAyOjExOjIzICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIiB4bWxuczpzdFJlZj0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL3NUeXBlL1Jlc291cmNlUmVmIyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgMjcuOSAoTWFjaW50b3NoKSIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDo5MDRGRUM5Njg5NTExMUYxOTNCQTlEM0EzRkQ3MEVGOCIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDo5MDRGRUM5Nzg5NTExMUYxOTNCQTlEM0EzRkQ3MEVGOCI+IDx4bXBNTTpEZXJpdmVkRnJvbSBzdFJlZjppbnN0YW5jZUlEPSJ4bXAuaWlkOjkwNEZFQzk0ODk1MTExRjE5M0JBOUQzQTNGRDcwRUY4IiBzdFJlZjpkb2N1bWVudElEPSJ4bXAuZGlkOjkwNEZFQzk1ODk1MTExRjE5M0JBOUQzQTNGRDcwRUY4Ii8+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+/+4ADkFkb2JlAGTAAAAAAf/bAIQABwUFBQUFBwUFBwoG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",
            "grid_values": "[[42,43,44,34,43,36,36,42,43,40,29,26,31,28,25,22,20,9,8,12,2,9,8,7,5],[43,44,39,40,40,39,38,44,38,35,31,28,24,22,18,24,21,18,15,13,3,2,8,7,5],[46,39,51,52,50,50,50,46,48,36,42,37,34,22,28,17,21,18,16,6,4,10,0,7,0],[39,49,43,55,56,48,51,42,46,48,43,32,27,24,21,26,23,20,10,6,4,10,0,0,0],[42,55,48,52,63,62,59,51,48,46,34,40,37,34,22,19,15,20,10,14,13,11,9,8,0],[44,56,65,62,72,67,65,47,44,48,45,35,38,34,22,26,23,20,18,16,4,3,8,8,0],[51,60,67,66,83,66,70,50,53,50,35,44,31,28,23,28,15,22,19,15,12,2,8,0,0],[54,53,62,76,92,77,72,65,44,50,45,44,31,34,24,20,24,13,18,16,13,11,9,0,0],[56,65,68,80,96,91,64,54,44,42,36,46,31,28,32,28,24,12,18,15,4,10,2,8,0],[46,56,71,83,84,76,64,52,48,52,34,44,31,28,31,27,24,14,19,7,14,12,2,9,7],[52,59,59,66,70,79,59,50,55,40,46,43,38,27,22,20,24,21,19,8,6,12,9,7,0],[53,59,55,62,70,71,62,50,52,38,36,35,37,26,22,27,23,20,9,8,14,4,9,0,0],[42,43,57,64,65,53,60,45,42,45,45,41,38,33,22,25,15,12,10,8,5,10,8,8,6],[46,42,42,54,50,46,55,43,45,43,34,39,36,25,29,18,22,20,18,15,13,10,1,0,0],[34,37,40,52,52,48,51,47,38,38,41,30,35,30,20,17,13,18,7,6,12,3,9,8,5],[34,46,45,37,36,46,44,36,43,43,32,29,26,30,19,24,21,10,8,6,4,1,1,7,0],[34,35,37,45,38,38,37,36,42,39,29,26,31,28,17,13,20,9,14,5,2,8,7,7,0],[32,41,43,36,43,35,34,42,31,30,34,24,22,19,23,14,11,8,6,12,10,9,0,0,5],[37,30,31,32,32,32,30,38,36,35,31,29,28,25,13,20,9,7,13,11,9,9,0,0,6],[34,35,28,36,29,36,37,27,33,32,22,19,26,23,13,10,9,7,13,11,10,0,0,6,4],[23,33,26,35,34,26,25,33,23,22,28,17,23,22,19,10,7,5,5,2,1,0,0,0,4],[27,21,23,23,30,30,31,29,28,27,26,15,13,19,18,9,14,5,11,10,1,6,0,0,0],[27,26,28,21,20,19,28,19,27,17,16,13,21,18,9,7,13,3,2,1,0,0,5,4,4],[23,24,25,25,18,26,16,17,23,15,21,19,11,9,15,14,3,2,9,0,0,0,4,0,5],[12,13,23,23,14,15,14,22,12,13,18,10,9,8,13,12,3,10,9,0,0,6,0,4,0]]",
            "params": "{\"shape\":\"ellipse\",\"cx\":4,\"cz\":16,\"rx\":7,\"rz\":9,\"hJunction\":40,\"hPeak\":100,\"dArch\":2.5,\"insideBottom\":2,\"insideTop\":7,\"outsideBottom\":3,\"outsideTop\":5}",
            "prodId": 7
      }
];

async function runFansMigration(): Promise<void> {
  const layers = await storage.getLayers();
  const needsMigration = layers.some(l => l.name.startsWith('Layer '));
  if (!needsMigration) return;
  console.log('Running FANS layer migration...');
  for (const layer of FANS_MIGRATION_DATA) {
    await storage.updateLayerMeta(layer.prodId, {
      name: layer.name,
      name2: layer.name2 ?? undefined,
      description: layer.description ?? undefined,
      icon: layer.icon ?? undefined,
    });
    await storage.updateLayerGridValues(layer.prodId, layer.grid_values, layer.params ?? undefined);
  }
  console.log('FANS migration complete.');
}

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
  await runFansMigration();
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


  // POST /api/admin/seed-fans-layers — one-time migration: overwrites prod Layer 1-4 with FANS data
  app.post("/api/admin/seed-fans-layers", async (_req, res) => {
    try {
      const FANS = FANS_MIGRATION_DATA;
      const results = [];
      for (const layer of FANS) {
        const updated = await storage.updateLayerMeta(layer.prodId, {
          name: layer.name,
          name2: layer.name2 ?? undefined,
          description: layer.description ?? undefined,
          icon: layer.icon ?? undefined,
        });
        // Also update grid_values and params directly
        await storage.updateLayerGridValues(layer.prodId, layer.grid_values, layer.params ?? undefined);
        results.push({ id: layer.prodId, name: updated.name });
      }
      res.json({ ok: true, updated: results });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: String(err) });
    }
  });

    return httpServer;
}
