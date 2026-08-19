const fs = require('fs');
const { generateGridFromTraces, validateGrid } = require('./generate-layer-grid.cjs');
const { Client } = require('pg');
const [,, pointsFile, name, totalStr, affiliation, gender, medium, rankStr, iconFile, traceFile, methodStr] = process.argv;
(async () => {
  const points = JSON.parse(fs.readFileSync(pointsFile, 'utf8'));
  const totalMillions = +totalStr;
  let grid = generateGridFromTraces(points, { totalMillions });
  const problems = validateGrid(grid);
  if (problems.length) console.warn('validation warnings:', JSON.stringify(problems));
  // rescale to exact total
  const s0 = grid.flat().reduce((a,v)=>a+v,0);
  grid = grid.map(r => r.map(v => +(v*totalMillions/s0).toFixed(6)));
  const s1 = grid.flat().reduce((a,v)=>a+v,0);
  let pr=0,pc=0; grid.forEach((r,ri)=>r.forEach((v,ci)=>{ if(v>grid[pr][pc]){pr=ri;pc=ci;} }));
  grid[pr][pc] = +(grid[pr][pc] + (totalMillions - s1)).toFixed(6);
  const sum = grid.flat().reduce((a,v)=>a+v,0);
  console.log(`${name}: sum=${sum.toFixed(6)}M peak=${grid[pr][pc].toFixed(3)} at X${pc+1} Z${pr+1}`);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const g = JSON.stringify(grid);
  const res = await client.query(
    `INSERT INTO layers (name, color, grid_values, original_grid_values, affiliation, active)
     VALUES ($1, $2, $3, $3, $4, true) RETURNING id`,
    [name, '#a8d4d2', g, affiliation]
  );
  const id = res.rows[0].id;
  console.log('inserted layer id', id);
  await client.end();
  fs.writeFileSync(traceFile, JSON.stringify({ name, totalMillions, method: methodStr, points }, null, 1));
  const icon = 'data:image/png;base64,' + fs.readFileSync(iconFile).toString('base64');
  const r2 = await fetch(`http://localhost:5000/api/layers/${id}/rename`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ icon, gender, primaryMedium: medium, rank: +rankStr }),
  });
  const j = await r2.json();
  console.log('meta patch', r2.status, j.name, j.affiliation, 'rank', j.rank, 'icon len', (j.icon||'').length);
})().catch(e => { console.error(e); process.exit(1); });
