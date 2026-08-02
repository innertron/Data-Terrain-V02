import { writeFileSync } from 'fs';

const COLS = 25;
const ROWS = 25;

// Rotated ellipse test:
//   center (cx, cy), semi-major a, semi-minor b, rotation angle θ
//   returns the ellipse "radius" value — ≤1 means inside
function ellipseVal(col, row, cx, cy, a, b, angle) {
  const dx = col - cx;
  const dy = row - cy;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const u =  dx * cosA + dy * sinA;   // along major axis
  const v = -dx * sinA + dy * cosA;   // along minor axis
  return (u * u) / (a * a) + (v * v) / (b * b);
}

// Both ellipses share centre, run top-left → bottom-right at 45°
// (In SVG y goes downward, so 45° = π/4 aligns NW→SE)
const CX    = 12;          // svgCol centre
const CY    = 13;          // svgRow centre
const ANGLE = Math.PI / 4; // 45°

// Outer ellipse: a=13 (major), b=6 (minor)
const OUTER_A = 13, OUTER_B = 6;
// Inner ellipse: a=8,  b=3.5
const INNER_A = 8,  INNER_B = 3.5;

const grid = [];
for (let svgRow = 0; svgRow < ROWS; svgRow++) {
  grid[svgRow] = [];
  for (let svgCol = 0; svgCol < COLS; svgCol++) {
    const inner = ellipseVal(svgCol, svgRow, CX, CY, INNER_A, INNER_B, ANGLE);
    const outer = ellipseVal(svgCol, svgRow, CX, CY, OUTER_A, OUTER_B, ANGLE);

    let val;
    if (inner <= 1)       val = 11;   // inside inner ellipse
    else if (outer <= 1)  val = 10;   // between ellipses
    else                  val = 9;    // outside
    grid[svgRow][svgCol] = val;
  }
}

// CSV: header x1..x25, rows top (z25) → bottom (z1)
const header = Array.from({ length: COLS }, (_, i) => `x${i + 1}`).join(',');
const csvRows = [header];
for (let svgRow = 0; svgRow < ROWS; svgRow++) {
  csvRows.push(grid[svgRow].join(','));
}

writeFileSync('client/public/grid-layer3.csv', csvRows.join('\n'), 'utf8');
console.log('Written: client/public/grid-layer3.csv');
