import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  applyRadialMonotonicityFix,
  generateGrid,
  generateGridFromTraces,
} = require("../scripts/generate-layer-grid.cjs");
const {
  buildExactGrid,
  chooseTrace,
  loadTraceGroups,
  sumGrid,
  validateAgainstTrace,
} = require("../scripts/rebuild-layer-grids-from-traces.cjs");

function plateauEdgeRatio(grid: number[][]): number {
  let equalEdges = 0;
  let totalEdges = 0;

  for (let row = 0; row < 25; row++) {
    for (let col = 0; col < 25; col++) {
      if (col < 24) {
        totalEdges++;
        if (grid[row][col] === grid[row][col + 1]) equalEdges++;
      }
      if (row < 24) {
        totalEdges++;
        if (grid[row][col] === grid[row + 1][col]) equalEdges++;
      }
    }
  }

  return equalEdges / totalEdges;
}

for (const traceFile of [
  "data/scott-jennings-trace-points.json",
  "data/ari-shapiro-trace-points.json",
  "data/kai-ryssdal-trace-points.json",
]) {
  test(`preserves integrated RBF slopes for ${traceFile}`, () => {
    const trace = JSON.parse(fs.readFileSync(traceFile, "utf8"));
    const integratedGrid = generateGridFromTraces(trace.points, {
      totalMillions: trace.totalMillions,
    });
    const flattenedGrid = applyRadialMonotonicityFix(integratedGrid).fixed;

    assert.notDeepEqual(integratedGrid, flattenedGrid);
    assert.ok(
      plateauEdgeRatio(integratedGrid) + 0.1 <
        plateauEdgeRatio(flattenedGrid),
    );
  });
}

test("the direct control-point generator does not auto-flatten its RBF output", () => {
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
  const integratedGrid = generateGrid(controlPoints, { totalMillions: 10 });
  const flattenedGrid = applyRadialMonotonicityFix(integratedGrid).fixed;

  assert.notDeepEqual(integratedGrid, flattenedGrid);
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

  assert.equal(groups.size, 47);
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