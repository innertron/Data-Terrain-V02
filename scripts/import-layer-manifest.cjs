#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const {
  applyTopBandWeight,
  generateGridFromTraces,
  validateGrid,
} = require('./generate-layer-grid.cjs');
const { assertPrimaryMedium } = require('./primary-media.cjs');

const [, , manifestArg] = process.argv;
if (!manifestArg) {
  console.error('usage: node scripts/import-layer-manifest.cjs <manifest.json>');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const resolveFromRoot = (file) => path.resolve(root, file);
const manifest = JSON.parse(fs.readFileSync(resolveFromRoot(manifestArg), 'utf8'));

function buildExactGrid(trace, totalMillions) {
  const totalPrecision = Math.max(6, (String(totalMillions).split('.')[1] || '').length);
  const fittingPoints = applyTopBandWeight(trace.points, trace.topBandWeight ?? 1);
  let grid = generateGridFromTraces(fittingPoints, { totalMillions });
  const problems = validateGrid(grid);
  if (problems.length) throw new Error(`grid validation failed: ${JSON.stringify(problems)}`);

  const generatedTotal = grid.flat().reduce((sum, value) => sum + value, 0);
  grid = grid.map((row) => row.map((value) => +(value * totalMillions / generatedTotal).toFixed(totalPrecision)));

  let peakRow = 0;
  let peakCol = 0;
  grid.forEach((row, rowIndex) => row.forEach((value, colIndex) => {
    if (value > grid[peakRow][peakCol]) {
      peakRow = rowIndex;
      peakCol = colIndex;
    }
  }));

  const roundedTotal = grid.flat().reduce((sum, value) => sum + value, 0);
  grid[peakRow][peakCol] = +(grid[peakRow][peakCol] + totalMillions - roundedTotal).toFixed(totalPrecision);
  return grid;
}

async function importLayer(client, definition) {
  assertPrimaryMedium(definition.primaryMedium, definition.name || 'manifest layer');
  const trace = JSON.parse(fs.readFileSync(resolveFromRoot(definition.traceFile), 'utf8'));
  const grid = buildExactGrid(trace, definition.totalMillions);
  const gridJson = JSON.stringify(grid);
  const icon = `data:image/png;base64,${fs.readFileSync(resolveFromRoot(definition.iconFile)).toString('base64')}`;

  const existing = await client.query(
    'SELECT id FROM layers WHERE name = $1 ORDER BY id',
    [definition.name],
  );
  if (existing.rowCount > 1) {
    throw new Error(`cannot import "${definition.name}": found ${existing.rowCount} matching layers`);
  }

  const values = [
    definition.name,
    '#a8d4d2',
    gridJson,
    definition.affiliation,
    definition.gender,
    definition.primaryMedium,
    definition.isAfricanAmerican === true,
    definition.rank,
    icon,
  ];

  let id;
  if (existing.rowCount === 1) {
    id = existing.rows[0].id;
    await client.query(
      `UPDATE layers
       SET name = $1, color = $2, grid_values = $3, original_grid_values = $3,
           affiliation = $4, gender = $5, primary_medium = $6, is_african_american = $7,
           rank = $8, icon = $9, active = true
       WHERE id = $10`,
      [...values, id],
    );
  } else {
    const inserted = await client.query(
      `INSERT INTO layers
         (name, color, grid_values, original_grid_values, affiliation, gender,
          primary_medium, is_african_american, rank, icon, active)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, true)
       RETURNING id`,
      values,
    );
    id = inserted.rows[0].id;
  }

  const total = grid.flat().reduce((sum, value) => sum + value, 0);
  const totalPrecision = Math.max(6, (String(definition.totalMillions).split('.')[1] || '').length);
  console.log(`${existing.rowCount ? 'updated' : 'inserted'} ${definition.name} (id ${id}) — ${total.toFixed(totalPrecision)}M`);
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    for (const definition of manifest.layers ?? []) {
      await importLayer(client, definition);
    }
    for (const update of manifest.metadataUpdates ?? []) {
      const assignments = [];
      const values = [];
      if ("isAfricanAmerican" in update) {
        assignments.push(`is_african_american = $${values.length + 1}`);
        values.push(update.isAfricanAmerican === true);
      }
      if (update.iconFile) {
        assignments.push(`icon = $${values.length + 1}`);
        values.push(
          `data:image/png;base64,${fs.readFileSync(resolveFromRoot(update.iconFile)).toString("base64")}`,
        );
      }
      if (assignments.length === 0) {
        throw new Error(`metadata update for "${update.name}" has no supported fields`);
      }
      values.push(update.name);
      const result = await client.query(
        `UPDATE layers SET ${assignments.join(", ")} WHERE name = $${values.length} RETURNING id`,
        values,
      );
      if (result.rowCount === 0) {
        console.warn(`metadata update skipped; layer not found: ${update.name}`);
      } else {
        console.log(`updated ${update.name}: ${assignments.map(field => field.split(" = ")[0]).join(", ")}`);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});