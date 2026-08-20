#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const repair = process.argv.includes('--repair');
const traceOverrides = new Map([
  ['Sean Hannity', 'sean-hannity-trace-points.json'],
]);

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function sumGrid(grid) {
  return grid.flat().reduce((sum, value) => sum + Number(value || 0), 0);
}

function parseGrid(grid) {
  return typeof grid === 'string' ? JSON.parse(grid) : grid;
}

function totalPrecision(total) {
  for (let precision = 6; precision <= 10; precision++) {
    if (Math.abs(total - Number(total.toFixed(precision))) < 1e-10) return precision;
  }
  return 10;
}

function gridCoordinate(point, zeroBased) {
  const x = Number(point[0]);
  const z = Number(point[1]);
  return zeroBased ? [24 - z, x] : [25 - z, x - 1];
}

function applyMaskAndPreserveTotal(grid, zeroPoints, zeroBased) {
  const precision = totalPrecision(sumGrid(grid));
  const targetTotal = Number(sumGrid(grid).toFixed(precision));
  const masked = grid.map((row) => row.map(Number));

  for (const point of zeroPoints) {
    const [row, col] = gridCoordinate(point, zeroBased);
    masked[row][col] = 0;
  }

  const remainingTotal = sumGrid(masked);
  if (remainingTotal <= 0 && targetTotal > 0) {
    throw new Error('zero mask removed every positive cell');
  }

  const scaled = masked.map((row) => row.map((value) => (
    value === 0 ? 0 : Number((value * targetTotal / remainingTotal).toFixed(precision))
  )));

  let peakRow = 0;
  let peakCol = 0;
  scaled.forEach((row, rowIndex) => row.forEach((value, colIndex) => {
    if (value > scaled[peakRow][peakCol]) {
      peakRow = rowIndex;
      peakCol = colIndex;
    }
  }));

  const residual = targetTotal - sumGrid(scaled);
  scaled[peakRow][peakCol] = Number((scaled[peakRow][peakCol] + residual).toFixed(precision));
  return scaled;
}

function loadTraceGroups(layerNames) {
  const namesBySlug = new Map(layerNames.map((name) => [slugify(name), name]));
  const groups = new Map();
  const files = fs.readdirSync(path.join(root, 'data')).filter((file) => file.endsWith('-trace-points.json'));

  for (const file of files) {
    const document = JSON.parse(fs.readFileSync(path.join(root, 'data', file), 'utf8'));
    const points = Array.isArray(document) ? document : document.points;
    if (!Array.isArray(points) || !points.every((point) => Array.isArray(point) && point.length >= 3)) continue;

    const fileSlug = file.replace(/-trace-points\.json$/, '');
    const name = Array.isArray(document)
      ? namesBySlug.get(fileSlug)
      : document.name || document.layer;
    if (!name) continue;

    const candidate = {
      file,
      points,
      zeroBased: points.some(([x, z]) => Number(x) === 0 || Number(z) === 0),
      totalMillions: Array.isArray(document) ? null : Number(document.totalMillions),
    };
    groups.set(name, [...(groups.get(name) ?? []), candidate]);
  }
  return groups;
}

function chooseTrace(name, layerTotal, candidates) {
  const override = traceOverrides.get(name);
  if (override) {
    const selected = candidates.find((candidate) => candidate.file === override);
    if (!selected) throw new Error(`missing trace override for ${name}: ${override}`);
    return selected;
  }

  const totalMatches = candidates.filter((candidate) => (
    Number.isFinite(candidate.totalMillions)
    && Math.abs(candidate.totalMillions - layerTotal) < 1e-7
  ));
  if (totalMatches.length === 1) return totalMatches[0];
  if (candidates.length === 1) return candidates[0];
  throw new Error(`ambiguous trace source for ${name}: ${candidates.map((candidate) => candidate.file).join(', ')}`);
}

function countLeaks(grid, zeroPoints, zeroBased) {
  return zeroPoints.filter((point) => {
    const [row, col] = gridCoordinate(point, zeroBased);
    return grid[row]?.[col] !== 0;
  }).length;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT id, name, grid_values, original_grid_values
       FROM layers
       ORDER BY rank NULLS LAST, id`,
    );
    const traceGroups = loadTraceGroups(result.rows.map((row) => row.name));

    const audit = [];
    if (repair) await client.query('BEGIN');

    for (const row of result.rows) {
      const candidates = traceGroups.get(row.name) ?? [];
      if (candidates.length === 0) throw new Error(`no saved trace source for ${row.name}`);

      const grid = parseGrid(row.grid_values);
      const originalGrid = parseGrid(row.original_grid_values ?? row.grid_values);
      const layerTotal = sumGrid(grid);
      const trace = chooseTrace(row.name, layerTotal, candidates);
      const zeroPoints = trace.points.filter(([, , value]) => Number(value) === 0);
      const gridLeaks = countLeaks(grid, zeroPoints, trace.zeroBased);
      const originalLeaks = countLeaks(originalGrid, zeroPoints, trace.zeroBased);

      if (repair && (gridLeaks > 0 || originalLeaks > 0)) {
        const correctedGrid = applyMaskAndPreserveTotal(grid, zeroPoints, trace.zeroBased);
        const correctedOriginal = applyMaskAndPreserveTotal(originalGrid, zeroPoints, trace.zeroBased);
        await client.query(
          `UPDATE layers
           SET grid_values = $1, original_grid_values = $2
           WHERE id = $3`,
          [JSON.stringify(correctedGrid), JSON.stringify(correctedOriginal), row.id],
        );
      }

      audit.push({
        name: row.name,
        trace: trace.file,
        zeroCells: zeroPoints.length,
        gridLeaks,
        originalLeaks,
        total: layerTotal,
      });
    }

    if (repair) await client.query('COMMIT');

    const affected = audit.filter((entry) => entry.gridLeaks > 0 || entry.originalLeaks > 0);
    console.log(`${repair ? 'Repaired' : 'Found'} ${affected.length} affected layer(s) out of ${audit.length}.`);
    for (const entry of affected) {
      console.log(
        `${entry.name}: ${entry.zeroCells} source zeroes, `
        + `${entry.gridLeaks} grid leak(s), ${entry.originalLeaks} original-grid leak(s), `
        + `${entry.total.toFixed(totalPrecision(entry.total))}M`,
      );
    }
  } catch (error) {
    if (repair) await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});