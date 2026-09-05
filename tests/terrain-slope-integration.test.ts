import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  countViolations,
  findPeak,
  generateGrid,
} = require("../scripts/generate-layer-grid.cjs");
const {
  buildExactGrid,
  chooseTrace,
  loadTraceGroups,
  sumGrid,
  validateAgainstTrace,
} = require("../scripts/rebuild-layer-grids-from-traces.cjs");

test("the direct control-point generator restores radial transitions", () => {
  const controlPoints = [
    [13, 13, 10],
    [7, 13, 7],
    [19, 13, 6],
    [13, 7, 5],
    [13, 19, 4],
    [1, 1, 0],
    [25, 1, 0],
    [1, 25, 0],
    [25, 25, 0],
  ];
  const grid = generateGrid(controlPoints, { totalMillions: 10 });
  const peak = findPeak(grid);

  assert.equal(countViolations(grid, peak.r, peak.c), 0);
});

test("all saved layer traces rebuild with exact source invariants", () => {
  const dataDir = path.resolve("data");
  const files = fs.readdirSync(dataDir)
    .filter(file => file.endsWith("-trace-points.json"));
  const namedLayers = files.flatMap(file => {
    const document = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
    return Array.isArray(document) ? [] : [document.name || document.layer];
  }).filter(Boolean);
  const layerNames = [...new Set([
    ...namedLayers,
    "David Muir",
    "Tony Dokoupil",
  ])];
  const groups = loadTraceGroups(layerNames);

  assert.equal(groups.size, 98);
  for (const name of layerNames) {
    const trace = chooseTrace(name, groups.get(name) ?? []);
    const totalMillions = Number.isFinite(trace.totalMillions)
      ? trace.totalMillions
      : 1;
    const grid = buildExactGrid(trace, totalMillions);
    const validation = validateAgainstTrace(grid, trace, totalMillions);

    assert.equal(grid.length, 25, name);
    assert.ok(grid.every((row: number[]) => row.length === 25), name);
    assert.ok(Math.abs(sumGrid(grid) - totalMillions) < 1e-9, name);
    assert.equal(validation.zeroCells, trace.points.filter((point: number[]) => point[2] === 0).length, name);
  }
});