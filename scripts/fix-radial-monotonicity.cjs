#!/usr/bin/env node
/**
 * fix-radial-monotonicity.cjs
 *
 * Scans all layers in the dev DB for radial-monotonicity violations
 * (cells lower than a 4-neighbor that is farther from the peak).
 * Applies the same fix used for Ezra Klein: iteratively raise each cell
 * to match any 4-neighbor that is farther from the peak but higher, then
 * rescale to preserve the original grid total. Writes fixed grids to both
 * grid_values and original_grid_values.
 *
 * Usage: node scripts/fix-radial-monotonicity.cjs
 */

const { Client } = require('pg');

const N = 25;

/** Euclidean distance from peak (0-based row/col) */
function distFromPeak(pr, pc, r, c) {
  return Math.hypot(r - pr, c - pc);
}

/**
 * Find the peak cell (max value) in a grid.
 * Grid is stored row-0=Z1 (low income), storage orientation.
 * Returns { r, c, v } (0-based).
 */
function findPeak(grid) {
  let peak = { r: 0, c: 0, v: -Infinity };
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (grid[r][c] > peak.v) peak = { r, c, v: grid[r][c] };
    }
  }
  return peak;
}

/**
 * Count radial-monotonicity violations: cells where a 4-neighbor farther
 * from the peak is strictly higher than this cell.
 */
function countViolations(grid, pr, pc) {
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  let count = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const myDist = distFromPeak(pr, pc, r, c);
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
        const nDist = distFromPeak(pr, pc, nr, nc);
        // If neighbor is farther from peak but higher → violation
        if (nDist > myDist && grid[nr][nc] > grid[r][c] + 1e-9) {
          count++;
          break; // only count this cell once
        }
      }
    }
  }
  return count;
}

/**
 * Apply the radial-monotonicity fix:
 * Iterate: for each cell, if any 4-neighbor is farther from peak but higher,
 * raise this cell to that neighbor's value. Repeat until convergence.
 * Then rescale to preserve the original total.
 * Returns the fixed grid (deep copy).
 */
function applyFix(grid, pr, pc) {
  const fixed = grid.map(row => [...row]);
  const originalTotal = fixed.flat().reduce((a, v) => a + v, 0);
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];

  let changed = true;
  let iters = 0;
  while (changed) {
    changed = false;
    iters++;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const myDist = distFromPeak(pr, pc, r, c);
        for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
          const nDist = distFromPeak(pr, pc, nr, nc);
          if (nDist > myDist && fixed[nr][nc] > fixed[r][c] + 1e-9) {
            fixed[r][c] = fixed[nr][nc];
            changed = true;
          }
        }
      }
    }
    if (iters > 10000) { console.warn('  WARNING: fix did not converge in 10000 iterations'); break; }
  }

  // Rescale to original total
  const newTotal = fixed.flat().reduce((a, v) => a + v, 0);
  if (newTotal > 1e-9) {
    const scale = originalTotal / newTotal;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        fixed[r][c] = Math.round(fixed[r][c] * scale * 10000) / 10000;
      }
    }
  }

  return { fixed, iters };
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Fetch all layers
  const { rows: layers } = await client.query(
    'SELECT id, name, grid_values FROM layers ORDER BY id'
  );
  console.log(`Fetched ${layers.length} layers.\n`);

  const report = [];
  const toFix = [];

  for (const layer of layers) {
    let grid;
    try {
      grid = typeof layer.grid_values === 'string' ? JSON.parse(layer.grid_values) : layer.grid_values;
    } catch (e) {
      console.log(`[SKIP] ${layer.name} (id ${layer.id}): JSON parse error`);
      continue;
    }
    if (!grid || !Array.isArray(grid) || grid.length !== N) {
      console.log(`[SKIP] ${layer.name} (id ${layer.id}): invalid grid (length=${grid?.length})`);
      continue;
    }

    const { r: pr, c: pc, v: pv } = findPeak(grid);
    const violations = countViolations(grid, pr, pc);
    const total = grid.flat().reduce((a, v) => a + v, 0);

    if (violations === 0) {
      console.log(`[OK]   ${layer.name} (id ${layer.id}): peak at (r${pr+1},c${pc+1})=${pv.toFixed(4)}, total=${total.toFixed(3)}M, violations=0`);
      report.push({ id: layer.id, name: layer.name, violations: 0, fixed: false });
    } else {
      console.log(`[FIX]  ${layer.name} (id ${layer.id}): peak at (r${pr+1},c${pc+1})=${pv.toFixed(4)}, total=${total.toFixed(3)}M, violations=${violations}`);
      toFix.push({ layer, pr, pc, violations });
      report.push({ id: layer.id, name: layer.name, violations, fixed: true });
    }
  }

  console.log(`\n--- Summary: ${toFix.length} layer(s) need fixing ---\n`);

  for (const { layer, pr, pc, violations } of toFix) {
    const grid = typeof layer.grid_values === 'string' ? JSON.parse(layer.grid_values) : layer.grid_values;
    const originalTotal = grid.flat().reduce((a, v) => a + v, 0);

    console.log(`Fixing ${layer.name} (id ${layer.id}): ${violations} violations...`);
    const { fixed, iters } = applyFix(grid, pr, pc);

    const newTotal = fixed.flat().reduce((a, v) => a + v, 0);
    const newPeak = findPeak(fixed);
    const remainingViolations = countViolations(fixed, newPeak.r, newPeak.c);

    console.log(`  Converged in ${iters} iter(s). originalTotal=${originalTotal.toFixed(4)}, newTotal=${newTotal.toFixed(4)}, remaining violations=${remainingViolations}`);
    if (remainingViolations > 0) {
      console.warn(`  WARNING: ${remainingViolations} violations remain after fix!`);
    }

    const gridJson = JSON.stringify(fixed);
    const res = await client.query(
      'UPDATE layers SET grid_values=$1, original_grid_values=$1 WHERE id=$2 RETURNING name',
      [gridJson, layer.id]
    );
    if (res.rowCount !== 1) throw new Error(`Layer id ${layer.id} not found`);
    console.log(`  DB updated: ${res.rows[0].name}\n`);
  }

  await client.end();

  console.log('\n=== Final Report ===');
  console.log(`Total layers: ${layers.length}`);
  console.log(`Layers OK (no violations): ${report.filter(r => !r.fixed).length}`);
  console.log(`Layers fixed: ${report.filter(r => r.fixed).length}`);
  if (toFix.length > 0) {
    console.log('Fixed layers:');
    report.filter(r => r.fixed).forEach(r => console.log(`  - ${r.name} (id ${r.id}): ${r.violations} violations`));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
