import assert from "node:assert/strict";
import test from "node:test";

import {
  addZeroEdgeRandomBumps,
  ZERO_EDGE_RANDOM_RINGS,
} from "../server/terrainRandomness";

function filledGrid(value: number): number[][] {
  return Array.from({ length: 25 }, () => Array(25).fill(value));
}

test("adds tapered bumps to exactly three source-zero rings", () => {
  const source = filledGrid(0);
  source[12][12] = 10;
  const randomized = structuredClone(source);
  const noise = () => 0.75;

  const result = addZeroEdgeRandomBumps(randomized, source, 0, 0.02, noise);

  assert.equal(result[12][13], 5.075);
  assert.equal(result[12][14], 2.5375);
  assert.equal(result[12][15], 1.015);
  assert.equal(result[12][16], 0);
  assert.equal(ZERO_EDGE_RANDOM_RINGS, 3);
});

test("uses the immutable source footprint and does not mutate either grid", () => {
  const source = filledGrid(0);
  source[10][10] = 8;
  const randomized = structuredClone(source);
  randomized[10][11] = 99;
  const sourceSnapshot = structuredClone(source);
  const randomizedSnapshot = structuredClone(randomized);

  const first = addZeroEdgeRandomBumps(randomized, source, 0.01, 0.02, () => 0.25);
  const second = addZeroEdgeRandomBumps(randomized, source, 0.01, 0.02, () => 0.25);

  assert.deepEqual(first, second);
  assert.deepEqual(source, sourceSnapshot);
  assert.deepEqual(randomized, randomizedSnapshot);
  assert.ok(first[10][11] < 8);
  assert.equal(first[10][14], 0);
});