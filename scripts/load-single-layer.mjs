import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const file = process.argv[2];
if (!file) { console.error('Usage: node load-single-layer.mjs <csv-path>'); process.exit(1); }

const lines = readFileSync(file, 'utf8').trim().split('\n');
const rows  = lines.slice(1).map(l => l.split(',').map(Number));

let min = Infinity, max = -Infinity;
for (const row of rows) for (const v of row) { if (v < min) min = v; if (v > max) max = v; }
console.log(`min=${min}  max=${max}  spread=${max - min}`);

const norm = rows.map(row =>
  row.map(v => Math.round((v - min) / (max - min) * 100))
);

const sql = [];
for (let svgRow = 0; svgRow < 25; svgRow++) {
  const zIndex = 24 - svgRow;
  for (let svgCol = 0; svgCol < 25; svgCol++) {
    sql.push(`UPDATE grid_segments SET value=${norm[svgRow][svgCol]} WHERE x_index=${svgCol} AND z_index=${zIndex};`);
  }
}

const sqlFile = '/tmp/load-single.sql';
writeFileSync(sqlFile, sql.join('\n'));
execSync(`psql $DATABASE_URL -f ${sqlFile}`, { stdio: 'pipe' });
console.log('Done — reload the DemoScape preview.');
