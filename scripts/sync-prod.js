// sync-prod.js — mirror the dev database layers to production.
// Usage:
//   node scripts/sync-prod.js                 # full destructive mirror
//   node scripts/sync-prod.js --medium-only   # primary-medium metadata only
// Reads all layers from the local dev server and replaces the production
// layers with exact copies (grid values, rank, affiliation, medium, name2,
// description, icon, and demographic flags. Production ends up identical to dev.

import primaryMedia from "./primary-media.cjs";
import { pathToFileURL } from "node:url";

const DEV = "http://localhost:5000";
const PROD = "https://data-terrain-v-02.replit.app";
const MEDIUM_ONLY = process.argv.includes("--medium-only");
const PRIMARY_MEDIA = new Set(primaryMedia.PRIMARY_MEDIA);
const ALL_METADATA_FIELDS = [
  "name2",
  "description",
  "icon",
  "rank",
  "affiliation",
  "primaryMedium",
  "gender",
  "isAfricanAmerican",
];
const MEDIUM_SYNC_FIELDS = ["affiliation", "primaryMedium"];
const MEDIUM_SYNC_PROTECTED_FIELDS = [
  "id",
  "name",
  "name2",
  "description",
  "icon",
  "color",
  "gridValues",
  "active",
  "params",
  "rank",
  "gender",
  "isAfricanAmerican",
];

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

function gridToCsv(grid) {
  const header = Array.from({ length: 25 }, (_, i) => `x${i + 1}`).join(",");
  return header + "\n" + grid.map((r) => r.join(",")).join("\n");
}

function valuesMatch(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function indexLayersByName(layers, environment) {
  const byName = new Map();
  for (const layer of layers) {
    if (byName.has(layer.name)) {
      throw new Error(`${environment} contains duplicate layer name "${layer.name}"`);
    }
    byName.set(layer.name, layer);
  }
  return byName;
}

function assertSameLayerNames(devLayers, prodLayers) {
  const devByName = indexLayersByName(devLayers, "Development");
  const prodByName = indexLayersByName(prodLayers, "Production");
  const missing = [...devByName.keys()].filter(name => !prodByName.has(name));
  const extra = [...prodByName.keys()].filter(name => !devByName.has(name));
  if (missing.length || extra.length) {
    throw new Error(
      `Layer names differ. Missing in production: ${missing.join(", ") || "none"}. ` +
      `Only in production: ${extra.join(", ") || "none"}.`,
    );
  }
  return { devByName, prodByName };
}

export function assertCanonicalMedia(layers, environment) {
  const invalid = layers.filter(layer => !PRIMARY_MEDIA.has(layer.primaryMedium));
  if (invalid.length) {
    throw new Error(
      `${environment} contains invalid primary media: ` +
      invalid.map(layer => `${layer.name} (${layer.primaryMedium ?? "empty"})`).join(", "),
    );
  }
}

function assertMatchingFields(devLayers, prodLayers, fields, label) {
  const { devByName, prodByName } = assertSameLayerNames(devLayers, prodLayers);
  const mismatches = [];
  for (const [name, devLayer] of devByName) {
    const prodLayer = prodByName.get(name);
    const changedFields = fields.filter(
      field => !valuesMatch(devLayer[field], prodLayer[field]),
    );
    if (changedFields.length) {
      mismatches.push(`${name}: ${changedFields.join(", ")}`);
    }
  }
  if (mismatches.length) {
    throw new Error(`${label} differ:\n  ${mismatches.join("\n  ")}`);
  }
}

async function syncMediumMetadata(devLayers, prodLayers) {
  assertCanonicalMedia(devLayers, "Development");
  const { devByName, prodByName } = assertSameLayerNames(devLayers, prodLayers);

  let updatedCount = 0;
  for (const [name, devLayer] of devByName) {
    const prodLayer = prodByName.get(name);
    const body = {};
    for (const field of MEDIUM_SYNC_FIELDS) {
      if (!valuesMatch(devLayer[field], prodLayer[field])) {
        if (devLayer[field] == null) {
          throw new Error(`Cannot clear ${field} for "${name}" through the metadata API`);
        }
        body[field] = devLayer[field];
      }
    }
    if (Object.keys(body).length === 0) continue;

    const res = await fetch(`${PROD}/api/layers/${prodLayer.id}/rename`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(
        `PATCH production metadata for "${name}" -> ${res.status} ${await res.text()}`,
      );
    }
    updatedCount++;
    console.log(`  updated "${name}": ${Object.keys(body).join(", ")}`);
  }

  const finalLayers = await getJson(`${PROD}/api/layers`);
  assertCanonicalMedia(finalLayers, "Production");
  assertMatchingFields(
    prodLayers,
    finalLayers,
    MEDIUM_SYNC_PROTECTED_FIELDS,
    "Protected production fields after medium-only sync",
  );
  assertMatchingFields(
    devLayers,
    finalLayers,
    ALL_METADATA_FIELDS,
    "Development and production metadata",
  );
  console.log(
    `Done. Updated ${updatedCount} production layer(s); all metadata matches development.`,
  );
}

async function syncFull(devLayers, prodLayers) {
  assertCanonicalMedia(devLayers, "Development");

  // 1. Delete everything currently in prod (prod becomes an exact mirror of dev)
  for (const l of prodLayers) {
    const res = await fetch(`${PROD}/api/layers/${l.id}`, { method: "DELETE" });
    console.log(`  deleted prod "${l.name}" (id ${l.id}) -> ${res.status}`);
  }

  // 2. Recreate every dev layer in prod
  for (const l of devLayers) {
    const body = {
      name: l.name,
      color: l.color,
      csv: gridToCsv(l.gridValues),
      ...(l.rank != null ? { rank: l.rank } : {}),
      ...(l.affiliation ? { affiliation: l.affiliation } : {}),
      ...(l.primaryMedium ? { primaryMedium: l.primaryMedium } : {}),
      ...(l.gender ? { gender: l.gender } : {}),
      ...(l.isAfricanAmerican ? { isAfricanAmerican: true } : {}),
    };
    const res = await fetch(`${PROD}/api/layers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`  FAILED to create "${l.name}": ${res.status} ${await res.text()}`);
      process.exitCode = 1;
      continue;
    }
    const created = await res.json();
    console.log(`  created prod "${l.name}" (id ${created.id})`);

    // 3. Copy secondary meta (name2, description, icon, demographic flags) if present
    if (l.name2 || l.description || l.icon || l.isAfricanAmerican) {
      const patch = await fetch(`${PROD}/api/layers/${created.id}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: l.name,
          ...(l.name2 ? { name2: l.name2 } : {}),
          ...(l.description ? { description: l.description } : {}),
          ...(l.icon ? { icon: l.icon } : {}),
          ...(l.isAfricanAmerican ? { isAfricanAmerican: true } : {}),
        }),
      });
      console.log(`    meta patch -> ${patch.status}`);
    }
  }

  // 4. Sync axis data (X/Z labels + descriptions) stored in project settings
  const devSettings = await getJson(`${DEV}/api/settings`);
  for (const key of ["axis_x", "axis_z"]) {
    if (!devSettings[key]) continue;
    const res = await fetch(`${PROD}/api/settings/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: devSettings[key] }),
    });
    console.log(`  synced ${key} -> ${res.status}`);
  }

  // 5. Verify
  const final = await getJson(`${PROD}/api/layers`);
  assertCanonicalMedia(final, "Production");
  assertMatchingFields(
    devLayers,
    final,
    ALL_METADATA_FIELDS,
    "Development and production metadata",
  );
  console.log(`Done. Prod now has ${final.length} layers: ${final.map((l) => l.name).join(", ")}`);
}

async function main() {
  const devLayers = await getJson(`${DEV}/api/layers`);
  const prodLayers = await getJson(`${PROD}/api/layers`);
  console.log(`Dev layers: ${devLayers.length} | Prod layers: ${prodLayers.length}`);

  if (MEDIUM_ONLY) {
    await syncMediumMetadata(devLayers, prodLayers);
    return;
  }
  await syncFull(devLayers, prodLayers);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Sync failed:", err.message);
    process.exit(1);
  });
}
