#!/usr/bin/env node
// One-off: partitions unchanged; remap band values + total for Leland Vittert & Lester Holt.
const fs = require('fs');
const { generateGridFromTraces, validateGrid } = require('./generate-layer-grid.cjs');
const { Client } = require('pg');

const updates = [
  {
    file: 'data/leland-vittert-trace-points.json',
    layerId: 41,
    totalMillions: 13.1556,
    // old band value -> new band value (high->low)
    map: { 8.03: 7.86, 3.27: 3.19, 1.33: 1.30, 0.54: 0.53, 0.22: 0.22, 0.069: 0.054, 0.039: 0.001, 0: 0 },
    method: 'band values updated from 006_Leland_Vittert_BAND_PART_1786934523302.png (partition unchanged); bands 7.86/3.19/1.30/0.53/0.22/0.054/0.001; Aug 16 2026',
  },
  {
    file: 'data/lester-holt-trace-points.json',
    layerId: 45,
    totalMillions: 13.588264,
    map: { 7.87: 8.08, 3.24: 3.30, 1.34: 1.35, 0.55: 0.55, 0.23: 0.23, 0.076: 0.048, 0.07: 0.040, 0: 0 },
    method: 'band values updated from 08_Lester_Holt_BAND_PART_1786934530276.png (partition unchanged); bands 8.08/3.30/1.35/0.55/0.23/0.048/0.040; Aug 16 2026',
  },
];

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  for (const u of updates) {
    const d = JSON.parse(fs.readFileSync(u.file, 'utf8'));
    const points = d.points.map(([x, z, v]) => {
      if (!(v in u.map)) throw new Error(`${u.file}: unmapped band value ${v}`);
      return [x, z, u.map[v]];
    });
    const grid = generateGridFromTraces(points, { totalMillions: u.totalMillions });
    const problems = validateGrid(grid);
    if (problems.length) console.warn(`${d.name} validation warnings:`, JSON.stringify(problems));
    const sum = grid.flat().reduce((a, v) => a + v, 0);
    let peak = { v: -1 };
    grid.forEach((row, r) => row.forEach((v, c) => { if (v > peak.v) peak = { v, Z: r + 1, X: c + 1 }; }));
    console.log(`${d.name}: sum=${sum.toFixed(3)}M peak=${peak.v.toFixed(3)} at X${peak.X} Z${peak.Z}`);
    const gridJson = JSON.stringify(grid);
    const res = await client.query(
      'UPDATE layers SET grid_values=$1, original_grid_values=$1 WHERE id=$2 RETURNING name',
      [gridJson, u.layerId]
    );
    if (res.rowCount !== 1) throw new Error(`layer id ${u.layerId} not found`);
    console.log(`  DB updated: layer ${u.layerId} (${res.rows[0].name})`);
    fs.writeFileSync(u.file, JSON.stringify({ ...d, totalMillions: u.totalMillions, method: u.method, points }, null, 1));
    console.log(`  trace file updated: ${u.file}`);
  }
  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
