#!/usr/bin/env node

/**
 * Rebuild every layer from its saved painted-partition trace.
 *
 * This is intentionally different from a mask-only repair: when a past
 * repair used an incorrect coordinate transform, it may have erased valid
 * positive cells. Rebuilding from the source trace restores the terrain,
 * applies the source zero mask in the correct storage orientation, and
 * preserves each supplied ViewerScore total exactly.
 *
 * Usage:
 *   node scripts/rebuild-layer-grids-from-traces.cjs --dry-run
 *   node scripts/rebuild-layer-grids-from-traces.cjs --apply
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { generateGridFromTraces, validateGrid } = require('./generate-layer-grid.cjs');

const root = path.resolve(__dirname, '..');
const apply = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run');

if (require.main === module && !apply && !dryRun) {
  console.error('Choose --dry-run or --apply.');
  process.exit(1);
}

const traceOverrides = new Map([
  ['Chris Cuomo', 'chris-cuomo-trace-points.json'],
  ['Kaitlan Collins', 'kaitlan-collins-trace-points.json'],
  ['Saagar Enjeti', 'saagar-enjeti-trace-points.json'],
  ['Sean Hannity', 'sean-hannity-trace-points.json'],
]);

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function sumGrid(grid) {
  return grid.flat().reduce((sum, value) => sum + Number(value || 0), 0);
}

function parseGrid(grid) {
  return typeof grid === 'string' ? JSON.parse(grid) : grid;
}

function precisionFor(total) {
  return Math.max(6, (String(total).split('.')[1] || '').length);
}

function loadTraceGroups(layerNames) {
  const namesBySlug = new Map(layerNames.map((name) => [slugify(name), name]));
  const groups = new Map();
  const files = fs.readdirSync(path.join(root, 'data')).filter((file) => file.endsWith('-trace-points.json'));

  for (const file of files) {
    const document = JSON.parse(fs.readFileSync(path.join(root, 'data', file), 'utf8'));
    const points = Array.isArray(document) ? document : document.points;
    if (!Array.isArray(points) || !points.every((point) => Array.isArray(point) && point.length >= 3)) continue;

    const name = Array.isArray(document)
      ? namesBySlug.get(file.replace(/-trace-points\.json$/, ''))
      : document.name || document.layer;
    if (!name) continue;

    const zeroBased = points.some(([x, z]) => Number(x) === 0 || Number(z) === 0);
    groups.set(name, [...(groups.get(name) ?? []), {
      file,
      points,
      zeroBased,
      totalMillions: Array.isArray(document) ? null : Number(document.totalMillions),
    }]);
  }

  return groups;
}

function chooseTrace(name, candidates) {
  const override = traceOverrides.get(name);
  if (override) {
    const selected = candidates.find((candidate) => candidate.file === override);
    if (!selected) throw new Error(`missing trace override for ${name}: ${override}`);
    return selected;
  }
  if (candidates.length === 1) return candidates[0];
  throw new Error(`ambiguous trace source for ${name}: ${candidates.map((candidate) => candidate.file).join(', ')}`);
}

function normalizedPoints(trace) {
  return trace.zeroBased
    ? trace.points.map(([x, z, value]) => [Number(x) + 1, Number(z) + 1, Number(value)])
    : trace.points.map(([x, z, value]) => [Number(x), Number(z), Number(value)]);
}

function unsupportedSignificantMaxima(problems, trace) {
  if (problems.length === 0) return [];

  const points = normalizedPoints(trace);
  const sourceByCell = new Map(
    points.map(([x, z, value]) => [`${x},${z}`, Number(value)]),
  );
  const sourcePeak = Math.max(...points.map(([, , value]) => value));
  const positiveBands = [...new Set(points.map(([, , value]) => value).filter((value) => value > 0))]
    .sort((a, b) => a - b);

  return problems.filter(({ X, Z }) => {
    const sourceValue = sourceByCell.get(`${X},${Z}`);
    if (!(sourceValue > 0) || sourceValue / sourcePeak < 0.2) return true;

    let localSourceMax = sourceValue;
    for (let deltaX = -1; deltaX <= 1; deltaX++) {
      for (let deltaZ = -1; deltaZ <= 1; deltaZ++) {
        localSourceMax = Math.max(
          localSourceMax,
          sourceByCell.get(`${X + deltaX},${Z + deltaZ}`) ?? -Infinity,
        );
      }
    }

    const sourceBand = positiveBands.indexOf(sourceValue);
    const localBand = positiveBands.indexOf(localSourceMax);
    // RBF smoothing may move a lobe's crest by one cell into the adjacent
    // painted band. Larger shifts indicate unsupported interpolation ringing.
    return sourceBand < 0 || localBand - sourceBand > 1;
  });
}

function buildExactGrid(trace, totalMillions) {
  const precision = precisionFor(totalMillions);
  let grid = generateGridFromTraces(normalizedPoints(trace), { totalMillions });
  const problems = validateGrid(grid);
  const unsupportedMaxima = unsupportedSignificantMaxima(problems, trace);
  if (unsupportedMaxima.length) {
    throw new Error(
      `unsupported significant maxima in ${trace.file}: ${JSON.stringify(unsupportedMaxima)}`,
    );
  }

  const generatedTotal = sumGrid(grid);
  grid = grid.map((row) => row.map((value) => +(value * totalMillions / generatedTotal).toFixed(precision)));

  let peakRow = 0;
  let peakCol = 0;
  grid.forEach((row, rowIndex) => row.forEach((value, colIndex) => {
    if (value > grid[peakRow][peakCol]) {
      peakRow = rowIndex;
      peakCol = colIndex;
    }
  }));

  const residual = totalMillions - sumGrid(grid);
  grid[peakRow][peakCol] = +(grid[peakRow][peakCol] + residual).toFixed(precision);
  return grid;
}

function traceGridCoordinate(point, zeroBased) {
  const x = Number(point[0]);
  const z = Number(point[1]);
  return zeroBased ? [z, x] : [z - 1, x - 1];
}

function validateAgainstTrace(grid, trace, totalMillions) {
  const zeroPoints = trace.points.filter(([, , value]) => Number(value) === 0);
  const zeroLeaks = zeroPoints.filter((point) => {
    const [row, col] = traceGridCoordinate(point, trace.zeroBased);
    return grid[row]?.[col] !== 0;
  }).length;
  const total = sumGrid(grid);
  const totalMatches = Math.abs(total - totalMillions) < 1e-9;

  let peakRow = 0;
  let peakCol = 0;
  grid.forEach((row, rowIndex) => row.forEach((value, colIndex) => {
    if (value > grid[peakRow][peakCol]) {
      peakRow = rowIndex;
      peakCol = colIndex;
    }
  }));
  const peakX = trace.zeroBased ? peakCol : peakCol + 1;
  const peakZ = trace.zeroBased ? peakRow : peakRow + 1;
  const sourcePeakValue = Math.max(...trace.points.map(([, , value]) => Number(value)));
  const sourcePeakPoints = trace.points.filter(([, , value]) => (
    Math.abs(Number(value) - sourcePeakValue) < 1e-9
  ));
  const peakDistance = Math.min(...sourcePeakPoints.map(([x, z]) => (
    Math.max(Math.abs(Number(x) - peakX), Math.abs(Number(z) - peakZ))
  )));

  const sourceValues = [];
  const correctValues = [];
  const flippedValues = [];
  for (const point of trace.points) {
    const [row, col] = traceGridCoordinate(point, trace.zeroBased);
    sourceValues.push(Number(point[2]));
    correctValues.push(grid[row][col]);
    flippedValues.push(grid[24 - row][col]);
  }
  const correlation = (a, b) => {
    const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
    const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
    let numerator = 0;
    let denominatorA = 0;
    let denominatorB = 0;
    for (let index = 0; index < a.length; index++) {
      const deltaA = a[index] - meanA;
      const deltaB = b[index] - meanB;
      numerator += deltaA * deltaB;
      denominatorA += deltaA * deltaA;
      denominatorB += deltaB * deltaB;
    }
    return numerator / Math.sqrt(denominatorA * denominatorB);
  };
  const correctOrientationCorrelation = correlation(sourceValues, correctValues);
  const flippedOrientationCorrelation = correlation(sourceValues, flippedValues);
  const orientationMatches = correctOrientationCorrelation + 1e-9 >= flippedOrientationCorrelation;
  const peakNearTopBand = peakDistance <= 1;

  if (!totalMatches || zeroLeaks > 0 || !peakNearTopBand || !orientationMatches) {
    throw new Error(
      `trace validation failed: total ${total} (expected ${totalMillions}), `
      + `${zeroLeaks} zero-mask leak(s), peak X${peakX}/Z${peakZ} is ${peakDistance} cell(s) `
      + `from the top band, orientation correlations correct=${correctOrientationCorrelation}, `
      + `flipped=${flippedOrientationCorrelation}`,
    );
  }
  return {
    zeroCells: zeroPoints.length,
    total,
    peakX,
    peakZ,
    correctOrientationCorrelation,
    flippedOrientationCorrelation,
  };
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const result = await client.query(
      'SELECT id, name, grid_values FROM layers ORDER BY rank NULLS LAST, id',
    );
    const traceGroups = loadTraceGroups(result.rows.map((row) => row.name));
    const report = [];

    if (apply) await client.query('BEGIN');
    for (const layer of result.rows) {
      const trace = chooseTrace(layer.name, traceGroups.get(layer.name) ?? []);
      const currentTotal = sumGrid(parseGrid(layer.grid_values));
      const targetTotal = Number.isFinite(trace.totalMillions) ? trace.totalMillions : currentTotal;
      const grid = buildExactGrid(trace, targetTotal);
      const validation = validateAgainstTrace(grid, trace, targetTotal);

      if (apply) {
        await client.query(
          'UPDATE layers SET grid_values = $1, original_grid_values = $1 WHERE id = $2',
          [JSON.stringify(grid), layer.id],
        );
      }

      report.push({
        name: layer.name,
        trace: trace.file,
        total: validation.total,
        zeroCells: validation.zeroCells,
        peakX: validation.peakX,
        peakZ: validation.peakZ,
        correctOrientationCorrelation: validation.correctOrientationCorrelation,
        flippedOrientationCorrelation: validation.flippedOrientationCorrelation,
        sourceTotal: Number.isFinite(trace.totalMillions),
      });
    }
    if (apply) await client.query('COMMIT');

    const sourceTotals = report.filter((entry) => entry.sourceTotal).length;
    const totalZeroCells = report.reduce((sum, entry) => sum + entry.zeroCells, 0);
    console.log(`${apply ? 'Rebuilt' : 'Validated rebuild for'} ${report.length} layers.`);
    console.log(`Checked ${totalZeroCells} painted-white cells; ${sourceTotals} layers use supplied source totals and ${report.length - sourceTotals} legacy layers retain their stored totals.`);
    for (const entry of report) {
      console.log(
        `${entry.name}: ${entry.total.toFixed(precisionFor(entry.total))}M, `
        + `${entry.zeroCells} source-zero cells, peak X${entry.peakX}/Z${entry.peakZ}, `
        + `orientation ${entry.correctOrientationCorrelation.toFixed(3)} vs flipped `
        + `${entry.flippedOrientationCorrelation.toFixed(3)} (${entry.trace})`,
      );
    }
  } catch (error) {
    if (apply) await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  buildExactGrid,
  chooseTrace,
  loadTraceGroups,
  normalizedPoints,
  precisionFor,
  sumGrid,
  unsupportedSignificantMaxima,
  validateAgainstTrace,
};