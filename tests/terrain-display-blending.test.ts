import assert from "node:assert/strict";
import test from "node:test";

import {
  blendTerrainTransitions,
  compressTerrainHeights,
  computeLayerValues,
  getRangeCellState,
  normalizeAxisRange,
} from "../client/src/lib/layers";

function filledGrid(value: number): number[][] {
  return Array.from({ length: 25 }, () => Array(25).fill(value));
}

test("compresses display height without lifting normalized zero", () => {
  const grid = filledGrid(0);
  grid[0].splice(0, 5, 0, 1, 10, 50, 100);

  const compressed = compressTerrainHeights(grid);

  assert.deepEqual(compressed[0].slice(0, 5), [0, 4, 17, 48, 75]);
  assert.equal(grid[0][4], 100);
  assert.equal(grid[1][0], 0);
});

test("applies compression only to a fresh display matrix", () => {
  const rawGrid = filledGrid(0);
  rawGrid[12][12] = 10;
  const activeGrids = [rawGrid];
  const snapshot = structuredClone(activeGrids);

  const displayValues = computeLayerValues(activeGrids);

  assert.ok(displayValues instanceof Map);
  assert.deepEqual(activeGrids, snapshot);
});

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

test("classifies range lens cells as intersection, strand, or outside", () => {
  const x: [number, number] = [4, 8];
  const z: [number, number] = [10, 14];
  assert.equal(getRangeCellState(6, 12, x, z), "intersection");
  assert.equal(getRangeCellState(6, 3, x, z), "x-only");
  assert.equal(getRangeCellState(1, 12, x, z), "z-only");
  assert.equal(getRangeCellState(1, 3, x, z), "outside");
});

test("full range keeps every cell in the normal intersection", () => {
  for (let x = 0; x < 25; x++) {
    for (let z = 0; z < 25; z++) {
      assert.equal(getRangeCellState(x, z, [0, 24], [0, 24]), "intersection");
    }
  }
});

test("normalizes reversed, fractional, and invalid range endpoints", () => {
  assert.deepEqual(normalizeAxisRange([14, 4]), [4, 14]);
  assert.deepEqual(normalizeAxisRange([-3, 28]), [0, 24]);
  assert.deepEqual(normalizeAxisRange([4.4, 9.7]), [4, 10]);
  assert.deepEqual(normalizeAxisRange([Number.NaN, Number.POSITIVE_INFINITY]), [0, 0]);
});

test("range endpoints are inclusive after normalization", () => {
  assert.equal(getRangeCellState(8, 14, [8, 4], [14, 10]), "intersection");
  assert.equal(getRangeCellState(4, 10, [8, 4], [14, 10]), "intersection");
  assert.equal(getRangeCellState(3, 10, [8, 4], [14, 10]), "z-only");
});