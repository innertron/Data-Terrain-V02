#!/usr/bin/env tsx

import { Client } from "pg";
import { normalizePrimaryMedium } from "../shared/mediaTaxonomy.ts";

type LayerMediumRow = {
  id: number;
  name: string;
  primary_medium: string | null;
};

const dryRun = process.argv.includes("--dry-run");
const client = new Client({ connectionString: process.env.DATABASE_URL });

await client.connect();
try {
  const { rows } = await client.query<LayerMediumRow>(
    "SELECT id, name, primary_medium FROM layers ORDER BY rank NULLS LAST, name",
  );
  const updates = rows.flatMap(row => {
    const normalized = normalizePrimaryMedium(row.primary_medium);
    if (row.primary_medium && !normalized) {
      throw new Error(
        `unsupported primary medium for "${row.name}": "${row.primary_medium}"`,
      );
    }
    return normalized !== row.primary_medium
      ? [{ ...row, normalized }]
      : [];
  });

  for (const update of updates) {
    console.log(
      `${update.name}: ${update.primary_medium ?? "(blank)"} -> ${update.normalized ?? "(blank)"}`,
    );
  }

  if (!dryRun && updates.length > 0) {
    await client.query("BEGIN");
    try {
      for (const update of updates) {
        await client.query(
          "UPDATE layers SET primary_medium = $1 WHERE id = $2",
          [update.normalized, update.id],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  console.log(
    `${dryRun ? "Would update" : "Updated"} ${updates.length} of ${rows.length} layers.`,
  );
} finally {
  await client.end();
}