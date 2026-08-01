import { writeFileSync } from 'fs';

const COLS = 25;
const ROWS = 25;
const CELL = 120;
const LINE = 2;
const PAD = LINE / 2;

// Circle: center at x13,z13 (0-indexed: col=12, row=12), radius=7 cells
const CX = 12; // 0-indexed column
const CZ = 12; // 0-indexed row (SVG top-to-bottom; row 0 = z25, row 24 = z1)
const RADIUS = 7;

const W = COLS * CELL + LINE;
const H = ROWS * CELL + LINE;

// Unicode subscript digits
const SUB = ['₀','₁','₂','₃','₄','₅','₆','₇','₈','₉'];
const sub = n => String(n).split('').map(d => SUB[+d]).join('');

// Build value map — inside circle = 10, outside = 9
const values = [];
// grid[svgRow][svgCol] = value
const grid = [];

for (let svgRow = 0; svgRow < ROWS; svgRow++) {
  grid[svgRow] = [];
  for (let svgCol = 0; svgCol < COLS; svgCol++) {
    const dist = Math.sqrt((svgCol - CX) ** 2 + (svgRow - CZ) ** 2);
    const val = dist <= RADIUS ? 10 : 9;
    grid[svgRow][svgCol] = val;
    values.push({ svgRow, svgCol, val });
  }
}

// CSV: 25 rows × 25 columns matrix
// Row 0 (top) = z25, Row 24 (bottom) = z1
// Col 0 (left) = x1, Col 24 (right) = x25
// Header row: x1,x2,...,x25
const header = Array.from({length: 25}, (_, i) => `x${i+1}`).join(',');
const csvRows = [header];
for (let svgRow = 0; svgRow < ROWS; svgRow++) {
  csvRows.push(grid[svgRow].join(','));
}

// Write CSV
writeFileSync('client/public/grid-circle.csv', csvRows.join('\n'), 'utf8');
console.log('CSV written: client/public/grid-circle.csv');

// Build SVG grid lines
let lines = '';
for (let c = 0; c <= COLS; c++) {
  const x = c * CELL + PAD;
  lines += `<line x1="${x}" y1="${PAD}" x2="${x}" y2="${H - PAD}"/>\n`;
}
for (let r = 0; r <= ROWS; r++) {
  const y = r * CELL + PAD;
  lines += `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}"/>\n`;
}

// Build cell labels (value + small coord)
let labels = '';
for (const { svgRow, svgCol, val } of values) {
  const cx = svgCol * CELL + CELL / 2 + PAD;
  const cy = svgRow * CELL + CELL / 2 + PAD;
  const xNum = svgCol + 1;
  const zNum = ROWS - svgRow;
  const isInside = val === 10;
  const fill = isInside ? '#111' : '#999';

  labels += `<text x="${cx}" y="${cy - 10}" font-size="32" font-weight="bold" fill="${fill}">${val}</text>\n`;
  labels += `<text x="${cx}" y="${cy + 22}" font-size="13" fill="#bbb">x${sub(xNum)},z${sub(zNum)}</text>\n`;
}

// Circle overlay
const circleSvgX = CX * CELL + CELL / 2 + PAD;
const circleSvgY = CZ * CELL + CELL / 2 + PAD;
const circleR = RADIUS * CELL;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${W}" height="${H}"
     viewBox="0 0 ${W} ${H}">

  <rect width="${W}" height="${H}" fill="white"/>

  <!-- Grid lines -->
  <g stroke="#ccc" stroke-width="${LINE}" stroke-linecap="square">
${lines}  </g>

  <!-- Cell values + coords -->
  <g text-anchor="middle" dominant-baseline="middle"
     font-family="DejaVu Sans, Helvetica, Arial, sans-serif">
${labels}  </g>

  <!-- Circle boundary -->
  <circle cx="${circleSvgX}" cy="${circleSvgY}" r="${circleR}"
          fill="none" stroke="#222" stroke-width="6" stroke-dasharray="20,8"/>

</svg>`;

writeFileSync('client/public/grid-circle.svg', svg, 'utf8');
console.log(`SVG written: client/public/grid-circle.svg  (${W}×${H}px)`);
