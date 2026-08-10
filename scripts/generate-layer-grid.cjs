#!/usr/bin/env node
/**
 * generate-layer-grid.js — FINAL, DO-NOT-TWEAK terrain grid generator.
 *
 * Method: multiquadric RBF interpolation from contour-chart control points.
 *   phi(r) = sqrt(r^2 + C^2)   with C = 2.5  (shape parameter)
 *   diagonal smoothing = 0.1
 * These parameters were tuned on the Sean Hannity layer (Aug 10 2026) and are
 * LOCKED. Do not change C or SMOOTH — smaller C rings (spurious bumps) on
 * steep contour cliffs; larger C flattens the peak and lifts far corners.
 *
 * Control-point rules (per contour chart):
 *  1. Sample each contour line with 3-5 well-spread points (do NOT densify —
 *     dense exact-interpolation points make ringing WORSE).
 *  2. Pin every unconstrained corner of the grid with a low/appropriate
 *     anchor value, or the RBF drifts there (both failure modes seen live:
 *     bottom-right overshoot bump, top-right upward drift).
 *  3. If a valley/notch appears between two contour arcs, add 1-2 bridge
 *     points at the midway value — never more (over-anchoring oscillates).
 *
 * Output convention: returns 25x25 matrix with row 0 = Z1 (LOW income) —
 * ready to store in layers.grid_values (app renders zIndex = 24 - rowIndex
 * against HIGH->LOW Z_LABELS).
 *
 * Usage as module:
 *   const { generateGrid, validateGrid } = require('./generate-layer-grid');
 *   const grid = generateGrid(controlPoints, { totalMillions: 14.5 });
 *   const problems = validateGrid(grid);   // [] means clean
 *
 * Usage as CLI (reads JSON file of control points [[x,z,value],...]):
 *   node scripts/generate-layer-grid.js points.json [totalMillions]
 */

const C = 2.5;      // multiquadric shape parameter — LOCKED
const SMOOTH = 0.1; // diagonal smoothing — LOCKED
const N = 25;       // grid size

/**
 * @param {Array<[number,number,number]>} cps control points [x(1-25), z(1-25), contourValue]
 * @param {{totalMillions?: number}} opts grid is scaled so all cells sum to this (default 14.5)
 * @returns {number[][]} 25x25, row 0 = Z1 (low income), col 0 = X1 (DEM side)
 */
function generateGrid(cps, opts = {}) {
  const totalMillions = opts.totalMillions ?? 14.5;
  const n = cps.length;
  const phi = r => Math.sqrt(r * r + C * C);
  // Build system A w = b with smoothing on the diagonal
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) =>
    phi(Math.hypot(cps[i][0] - cps[j][0], cps[i][1] - cps[j][1])) + (i === j ? SMOOTH : 0)));
  const b = cps.map(p => p[2]);
  // Gaussian elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]]; [b[col], b[piv]] = [b[piv], b[col]];
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / A[col][col];
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const w = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * w[j];
    w[i] = s / A[i][i];
  }
  const ev = (x, z) => cps.reduce((s, p, i) => s + w[i] * phi(Math.hypot(x - p[0], z - p[1])), 0);
  // Evaluate in chart orientation (r=0 is Z25), then normalize 0-10 and scale to total
  const vals = [];
  for (let r = 0; r < N; r++) {
    const row = [];
    for (let c = 0; c < N; c++) row.push(ev(c + 1, N - r));
    vals.push(row);
  }
  let mn = Infinity, mx = -Infinity;
  vals.flat().forEach(v => { mn = Math.min(mn, v); mx = Math.max(mx, v); });
  const norm = vals.map(row => row.map(v => (v - mn) / (mx - mn) * 10));
  const tot = norm.flat().reduce((a, v) => a + v, 0);
  const scaled = norm.map(row => row.map(v => Math.round(v * (totalMillions / tot) * 10000) / 10000));
  // Flip to storage convention: row 0 = Z1 (low income)
  return scaled.reverse();
}

/**
 * Validation checklist (run on EVERY generated grid before saving):
 *  - exactly one dominant peak (spurious local maxima above 30% of peak flagged)
 *  - flags every local maximum so you can compare against the contour chart
 * @param {number[][]} grid storage orientation (row 0 = Z1)
 * @returns {Array<{Z:number,X:number,v:number,note:string}>} problems ([] = clean)
 */
function validateGrid(grid) {
  let peak = 0;
  grid.forEach(row => row.forEach(v => peak = Math.max(peak, v)));
  const maxima = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const v = grid[r][c];
    let isMax = true;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < N && cc >= 0 && cc < N && grid[rr][cc] >= v) isMax = false;
    }
    if (isMax) maxima.push({ Z: r + 1, X: c + 1, v });
  }
  const significant = maxima.filter(m => m.v > peak * 0.3);
  const problems = [];
  if (significant.length > 1) {
    significant.forEach(m => problems.push({ ...m, note: 'possible spurious bump — verify against contour chart' }));
  }
  return problems;
}

// Reference: Sean Hannity control points (the tuned example) — chart layer_02.
const HANNITY_CONTROL_POINTS = [
  // contour 0.54
  [1, 23, 0.54], [10, 22, 0.54], [18, 22, 0.54], [25, 23, 0.54],
  // contour 0.67
  [1, 20, 0.67], [10, 19, 0.67], [18, 19, 0.67], [25, 20, 0.67],
  // contour 0.84
  [1, 18, 0.84], [10, 17, 0.84], [18, 17, 0.84], [25, 18, 0.84],
  // contour 1.05
  [1, 15, 1.05], [10, 14, 1.05], [18, 15, 1.05], [25, 16, 1.05],
  // contour 1.31
  [6, 1, 1.31], [10, 3, 1.31], [14, 7, 1.31], [18, 11, 1.31], [25, 15, 1.31],
  // contour 1.64
  [12, 1, 1.64], [16, 4, 1.64], [19, 8, 1.64], [22, 12, 1.64], [25, 13.5, 1.64],
  // contour 2.05
  [18, 1, 2.05], [20, 3, 2.05], [22, 7, 2.05], [25, 12.5, 2.05],
  // contour 2.56 (closed arc hugging right edge — does NOT touch bottom)
  [24.2, 5, 2.56], [24, 7.5, 2.56], [24.3, 10.5, 2.56], [25, 13, 2.56],
  // contour 3.2 (innermost)
  [25, 8, 3.2], [24.5, 10.2, 3.2], [25, 12, 3.2],
  // bottom-right corner anchors (kill overshoot bump)
  [25, 1, 2.0], [23, 1, 2.0],
  // interior bridges (kill valley between 2.05 and 2.56 arcs)
  [23.2, 7.2, 2.3], [23.2, 9, 2.35], [23, 8, 2.3],
  // top-right flat anchors (kill upward drift above 0.54 line)
  [25, 25, 0.45], [22, 25, 0.45], [25, 24.5, 0.47],
];

module.exports = { generateGrid, validateGrid, C, SMOOTH, HANNITY_CONTROL_POINTS };

if (require.main === module) {
  const [, , file, total] = process.argv;
  const cps = file ? JSON.parse(require('fs').readFileSync(file, 'utf8')) : HANNITY_CONTROL_POINTS;
  const grid = generateGrid(cps, { totalMillions: total ? Number(total) : 14.5 });
  const problems = validateGrid(grid);
  if (problems.length) console.error('VALIDATION WARNINGS:', JSON.stringify(problems, null, 2));
  console.log(JSON.stringify(grid));
}
