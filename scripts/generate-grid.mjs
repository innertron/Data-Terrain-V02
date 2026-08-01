import { writeFileSync } from 'fs';

const COLS = 25;
const ROWS = 25;
const CELL = 180;          // px per cell
const LINE = 2;            // uniform line thickness
const PAD = LINE / 2;

const W = COLS * CELL + LINE;
const H = ROWS * CELL + LINE;

// Unicode subscript digits 0-9
const SUB = ['₀','₁','₂','₃','₄','₅','₆','₇','₈','₉'];
const sub = n => String(n).split('').map(d => SUB[+d]).join('');

// Build grid lines
let lines = '';

// Vertical lines (x = 0 … COLS)
for (let c = 0; c <= COLS; c++) {
  const x = c * CELL + PAD;
  lines += `<line x1="${x}" y1="${PAD}" x2="${x}" y2="${H - PAD}"/>\n`;
}

// Horizontal lines (y = 0 … ROWS)
for (let r = 0; r <= ROWS; r++) {
  const y = r * CELL + PAD;
  lines += `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}"/>\n`;
}

// Cell labels
// SVG row 0 (top)    → z25
// SVG row 24 (bottom)→ z1
// SVG col 0 (left)   → x1
let labels = '';
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const xNum = c + 1;
    const zNum = ROWS - r;       // top row = z25, bottom row = z1

    const cx = c * CELL + CELL / 2 + PAD;
    const cy = r * CELL + CELL / 2 + PAD;

    // "X₁,Z₁" — single line, centred
    const label = `X${sub(xNum)},Z${sub(zNum)}`;

    labels += `<text x="${cx}" y="${cy}">${label}</text>\n`;
  }
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${W}" height="${H}"
     viewBox="0 0 ${W} ${H}">

  <rect width="${W}" height="${H}" fill="white"/>

  <!-- Grid lines — all ${LINE}px, same weight -->
  <g stroke="black" stroke-width="${LINE}" stroke-linecap="square">
${lines}  </g>

  <!-- Coordinates — small, centred in each cell -->
  <g font-family="DejaVu Sans, Helvetica, Arial, sans-serif"
     font-size="44"
     font-weight="bold"
     text-anchor="middle"
     dominant-baseline="middle"
     fill="#aaa">
${labels}  </g>

</svg>`;

const outPath = 'client/public/grid-template.svg';
writeFileSync(outPath, svg, 'utf8');
console.log(`Written: ${outPath}  (${W}×${H}px)`);
