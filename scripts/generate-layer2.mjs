import { writeFileSync } from 'fs';

const COLS = 25;
const ROWS = 25;

// Quarter-circle centered at bottom-left corner (svgCol=0, svgRow=24)
// Inner arc radius = 8  → value 10 inside
// Outer arc radius = 15 → value 9 between arcs, value 8 outside
const CENTER_COL = 0;
const CENTER_ROW = 24;
const R_INNER = 8;
const R_OUTER = 15;

// Build 25×25 value grid
// grid[svgRow][svgCol]
const grid = [];
for (let svgRow = 0; svgRow < ROWS; svgRow++) {
  grid[svgRow] = [];
  for (let svgCol = 0; svgCol < COLS; svgCol++) {
    const dist = Math.sqrt(
      (svgCol - CENTER_COL) ** 2 + (svgRow - CENTER_ROW) ** 2
    );
    let val;
    if (dist <= R_INNER)       val = 10;
    else if (dist <= R_OUTER)  val = 9;
    else                       val = 8;
    grid[svgRow][svgCol] = val;
  }
}

// CSV: header x1..x25, then 25 rows (top row = z25, bottom = z1)
const header = Array.from({ length: COLS }, (_, i) => `x${i + 1}`).join(',');
const csvRows = [header];
for (let svgRow = 0; svgRow < ROWS; svgRow++) {
  csvRows.push(grid[svgRow].join(','));
}

writeFileSync('client/public/grid-layer2.csv', csvRows.join('\n'), 'utf8');
console.log('Written: client/public/grid-layer2.csv');
