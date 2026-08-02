import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

// 1. Read tester-database.csv
const lines = readFileSync('client/public/tester-database.csv', 'utf8')
  .trim().split('\n');
// skip header
const rows = lines.slice(1).map(l => l.split(',').map(Number));

// 2. Find min / max across all 625 cells
let min = Infinity, max = -Infinity;
for (const row of rows) {
  for (const v of row) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
}
console.log(`Raw  min=${min}  max=${max}  spread=${max - min}`);

// 3. Normalize: round((v - min) / (max - min) * 100)
const normGrid = rows.map(row =>
  row.map(v => Math.round((v - min) / (max - min) * 100))
);

// 4. Save normalised CSV (same layout — header + 25 rows)
const header = Array.from({ length: 25 }, (_, i) => `x${i + 1}`).join(',');
const normCSV = [header, ...normGrid.map(r => r.join(','))].join('\n');
writeFileSync('client/public/tester-database-normalised.csv', normCSV, 'utf8');
console.log('Normalised CSV written.');

// 5. Build SQL UPDATE statements and pipe to psql
// CSV row 0 (top) = z25 in user coords → z_index = 24 in DB (0-indexed)
// CSV col 0 (left) = x1 in user coords → x_index = 0 in DB (0-indexed)
const sqlLines = [];
for (let svgRow = 0; svgRow < 25; svgRow++) {
  const zIndex = 24 - svgRow;   // flip: svgRow 0 → zIndex 24 (z25)
  for (let svgCol = 0; svgCol < 25; svgCol++) {
    const xIndex = svgCol;
    const val    = normGrid[svgRow][svgCol];
    sqlLines.push(
      `UPDATE grid_segments SET value=${val} WHERE x_index=${xIndex} AND z_index=${zIndex};`
    );
  }
}

const sqlFile = '/tmp/load-grid.sql';
writeFileSync(sqlFile, sqlLines.join('\n'), 'utf8');
console.log(`Running ${sqlLines.length} SQL updates…`);
execSync(`psql $DATABASE_URL -f ${sqlFile}`, { stdio: 'pipe' });
console.log('Done — DB updated.');
