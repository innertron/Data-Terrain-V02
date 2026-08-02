import { readFileSync, writeFileSync } from 'fs';

function parseCSV(path) {
  const lines = readFileSync(path, 'utf8').trim().split('\n');
  // skip header row, parse remaining 25 rows
  return lines.slice(1).map(l => l.split(',').map(Number));
}

const l1 = parseCSV('attached_assets/layer_1_1785643045049.csv');
const l2 = parseCSV('attached_assets/grid-layer2_1785643045050.csv');
const l3 = parseCSV('attached_assets/grid-layer3_1785643045050.csv');

const header = Array.from({ length: 25 }, (_, i) => `x${i + 1}`).join(',');
const rows = [header];

for (let r = 0; r < 25; r++) {
  const row = [];
  for (let c = 0; c < 25; c++) {
    row.push(l1[r][c] + l2[r][c] + l3[r][c]);
  }
  rows.push(row.join(','));
}

writeFileSync('client/public/tester-database.csv', rows.join('\n'), 'utf8');
console.log('Written: client/public/tester-database.csv');

// Quick sanity check
console.log('Sample row 13:', rows[14]);
