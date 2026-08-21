#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import {
  PRIMARY_MEDIA,
  normalizePrimaryMedium,
} from "../shared/mediaTaxonomy.ts";

const [, , inputArg, outputArg] = process.argv;
if (!inputArg || !outputArg) {
  console.error(
    "usage: npx tsx scripts/standardize-media-chart.ts <input.csv> <output.csv>",
  );
  process.exit(1);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

function encodeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);
const lines = fs
  .readFileSync(inputPath, "utf8")
  .replace(/^\uFEFF/, "")
  .trimEnd()
  .split(/\r?\n/);
const header = parseCsvLine(lines[0]);

if (
  header[0] !== "Rank" ||
  header[1] !== "Person" ||
  header[2] !== "Affiliation" ||
  header[3] !== "Primary Medium"
) {
  throw new Error(
    'expected columns "Rank,Person,Affiliation,Primary Medium"',
  );
}

const counts = new Map<string, number>();
const outputRows = lines.slice(1).map((line, index) => {
  const [rank, person, outletOrPlatform, sourceMedium = ""] =
    parseCsvLine(line);
  const primaryMedium = normalizePrimaryMedium(sourceMedium);

  if (sourceMedium.trim() && !primaryMedium) {
    throw new Error(
      `row ${index + 2} (${person}) has unsupported primary medium "${sourceMedium}"`,
    );
  }

  const countKey = primaryMedium ?? "Unclassified";
  counts.set(countKey, (counts.get(countKey) ?? 0) + 1);
  return [rank, person, outletOrPlatform, primaryMedium ?? ""];
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  [
    ["Rank", "Person", "Outlet / Platform", "Primary Medium"],
    ...outputRows,
  ]
    .map(row => row.map(encodeCsvField).join(","))
    .join("\n") + "\n",
);

console.log(`Wrote ${outputRows.length} rows to ${outputPath}`);
for (const medium of [...PRIMARY_MEDIA, "Unclassified"]) {
  console.log(`${medium}: ${counts.get(medium) ?? 0}`);
}