import assert from "node:assert/strict";
import test from "node:test";

import { blendTerrainTransitions } from "../client/src/lib/layers";

function filledGrid(value: number): number[][] {
  return Array.from({ length: 25 }, () => Array(25).fill(value));
}

test("raises a zero boundary halfway and lowers its upper neighbor", () => {
  const grid = filledGrid(8);
  for (const row of grid) {
    row.fill(0, 0, 12);
  }

  const blended = blendTerrainTransitions(grid);

  assert.equal(blended[12][11], 4);
  assert.equal(blended[12][12], 6);
  assert.equal(blended[12][13], 8);
  assert.equal(blended[0][0], 0);
});

test("integrates adjacent terrain tiers without cascading", () => {
  const grid = filledGrid(78);
  for (const row of grid) {
    row.fill(17, 0, 11);
    row[11] = 41;
  }

  const blended = blendTerrainTransitions(grid);

  const [low, middle, high] = blended[12].slice(10, 13);
  assert.ok(low > 17);
  assert.ok(high < 78);
  assert.ok(middle - low <= 15);
  assert.ok(high - middle <= 15);
  assert.deepEqual(
    grid[12].slice(10, 13),
    [17, 41, 78],
  );
});

test("does not alter gradual nonzero slopes", () => {
  const grid = filledGrid(40);
  for (const row of grid) {
    row.fill(20, 0, 11);
    row[11] = 30;
  }

  const blended = blendTerrainTransitions(grid);

  assert.deepEqual(
    blended[12].slice(10, 13),
    [20, 30, 40],
  );
});