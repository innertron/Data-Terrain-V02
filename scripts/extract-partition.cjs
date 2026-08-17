#!/usr/bin/env node
/**
 * extract-partition.cjs — extract a 25×25 band grid from a painted partition PNG.
 * Usage: node scripts/extract-partition.cjs <png> <band1..band7 high->low, comma-sep>
 * Prints JSON { points: [[x,z,value]...], counts } to stdout; exits nonzero if any cell ambiguous.
 *
 * Method (per memory: photoshop-partition-pipeline):
 *  - board bbox: rows/cols containing gridline-ish or cell colors; derive pitch from bbox/25
 *  - never exact-match colors: nearest-match each cell's center-block majority color
 *    against canonical band colors + #EEEEEE (zero)
 *  - cell sampled as majority vote over block at center; ambiguous => error
 */
const { PNG } = require('pngjs');
const fs = require('fs');

const [, , file, bandsArg] = process.argv;
if (!file || !bandsArg) { console.error('usage: extract-partition.cjs <png> <7 band values high->low>'); process.exit(1); }
const bandValues = bandsArg.split(',').map(Number);
if (bandValues.length !== 7) { console.error('need exactly 7 band values'); process.exit(1); }

// canonical colors high->low, then zero cell
const palette = [
  [0x7F, 0x00, 0x00], [0xD7, 0x30, 0x1F], [0xFC, 0x8D, 0x59], [0xFD, 0xCC, 0x8A],
  [0xFF, 0xFF, 0xB2], [0xC7, 0xE9, 0xB4], [0x7F, 0xCD, 0xBB], [0xEE, 0xEE, 0xEE],
];
const values = [...bandValues, 0];

const png = PNG.sync.read(fs.readFileSync(file));
const { width: W, height: H, data } = png;
const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

// A pixel is "boardish" if within tight distance of any palette entry.
// #EEEEEE uses tight threshold (<15 rgb-dist) so white canvas isn't board.
const isBoardish = (c) => palette.some((p, i) => {
  const d = Math.sqrt(dist(c, p));
  return i === 7 ? d < 15 : d < 60;
});

// bbox: scan rows/cols where >40% of pixels are boardish
const rowFrac = new Array(H).fill(0), colFrac = new Array(W).fill(0);
for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
  if (isBoardish(px(x, y))) { rowFrac[y]++; colFrac[x]++; }
}
const rowsHit = [], colsHit = [];
for (let y = 0; y < H; y += 2) if (rowFrac[y] / (W / 2) > 0.4) rowsHit.push(y);
for (let x = 0; x < W; x += 2) if (colFrac[x] / (H / 2) > 0.4) colsHit.push(x);
const top = rowsHit[0], bottom = rowsHit[rowsHit.length - 1];
const left = colsHit[0], right = colsHit[colsHit.length - 1];
const pitchX = (right - left + 2) / 25;
// cells are square: derive height from width (memory: axis labels leak into bbox)
const pitchY = pitchX;
console.error(`bbox x[${left},${right}] y[${top},${bottom}] pitchX=${pitchX.toFixed(2)} bboxH/25=${((bottom - top + 2) / 25).toFixed(2)}`);

const points = [];
const counts = {};
let ambiguous = 0;
for (let zi = 0; zi < 25; zi++) { // zi=0 is TOP row = Z25
  for (let xi = 0; xi < 25; xi++) {
    const cx = Math.round(left + (xi + 0.5) * pitchX);
    const cy = Math.round(top + (zi + 0.5) * pitchY);
    const votes = new Array(palette.length).fill(0);
    const s = Math.max(2, Math.floor(pitchX / 6));
    for (let dy = -s; dy <= s; dy += 2) for (let dx = -s; dx <= s; dx += 2) {
      const c = px(cx + dx, cy + dy);
      let bi = 0, bd = Infinity;
      palette.forEach((p, i) => { const d = dist(c, p); if (d < bd) { bd = d; bi = i; } });
      if (bd < 90 * 90) votes[bi]++;
    }
    const totalVotes = votes.reduce((a, v) => a + v, 0);
    const win = votes.indexOf(Math.max(...votes));
    if (totalVotes === 0 || votes[win] / totalVotes < 0.6) {
      ambiguous++;
      console.error(`AMBIGUOUS cell X${xi + 1} Z${25 - zi}: votes=${votes} at (${cx},${cy})`);
    }
    counts[win] = (counts[win] || 0) + 1;
    points.push([xi + 1, 25 - zi, values[win]]);
  }
}
console.error(`cells: ${points.length}, ambiguous: ${ambiguous}, band counts:`, counts);
if (ambiguous > 0) process.exit(2);
console.log(JSON.stringify(points));
