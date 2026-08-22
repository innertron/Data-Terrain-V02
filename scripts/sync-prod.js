// sync-prod.js — mirror the dev database layers to production.
// Usage:
//   node scripts/sync-prod.js                 # full destructive mirror
//   node scripts/sync-prod.js --medium-only   # primary-medium metadata only
// Reads all layers from the local dev server and replaces the production
// layers with exact copies (grid values, rank, affiliation, medium, name2,
// description, icon, and demographic flags. Production ends up identical to dev.

import primaryMedia from "./primary-media.cjs";
import traceTools from "./rebuild-layer-grids-from-traces.cjs";
import { pathToFileURL } from "node:url";

const DEV = "http://localhost:5000";
const PROD = "https://data-terrain-v-02.replit.app";
const MEDIUM_ONLY = process.argv.includes("--medium-only");
const TRACE_TOTAL_TOLERANCE = 1e-9;
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
const FULL_SYNC_FIELDS = [
  "color",
  "gridValues",
  "originalGridValues",
  "active",
  "params",
  ...ALL_METADATA_FIELDS,
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
  "originalGridValues",
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

function assertGrid(grid, label) {
  if (
    !Array.isArray(grid) ||
    grid.length !== 25 ||
    grid.some(
      row =>
        !Array.isArray(row) ||
        row.length !== 25 ||
        row.some(value => !Number.isFinite(value)),
    )
  ) {
    throw new Error(`${label} must be a finite 25x25 numeric grid`);
  }
}

function assertTransferableLayerValues(layer, environment) {
  if (!PRIMARY_MEDIA.has(layer.primaryMedium)) {
    throw new Error(
      `${environment} contains invalid primary media: ` +
      `${layer.name} (${layer.primaryMedium ?? "empty"})`,
    );
  }
  assertGrid(layer.gridValues, `${environment} "${layer.name}" gridValues`);
  assertGrid(
    layer.originalGridValues,
    `${environment} "${layer.name}" originalGridValues`,
  );
  if (typeof layer.active !== "boolean") {
    throw new Error(`${environment} "${layer.name}" active must be boolean`);
  }
  if (layer.params != null) {
    if (typeof layer.params !== "string") {
      throw new Error(`${environment} "${layer.name}" params must be JSON text or null`);
    }
    try {
      JSON.parse(layer.params);
    } catch {
      throw new Error(`${environment} "${layer.name}" params contains invalid JSON`);
    }
  }
}

function sumGrid(grid) {
  return grid.flat().reduce((sum, value) => sum + value, 0);
}

function loadTraceTotals(layerNames) {
  const totals = new Map();
  const groups = traceTools.loadTraceGroups(layerNames);
  for (const name of layerNames) {
    const candidates = groups.get(name) ?? [];
    if (candidates.length === 0) continue;
    const trace = traceTools.chooseTrace(name, candidates);
    if (Number.isFinite(trace.totalMillions)) {
      totals.set(name, trace.totalMillions);
    }
  }
  return totals;
}

function assertTransferableLayers(layers, environment) {
  indexLayersByName(layers, environment);
  assertCanonicalMedia(layers, environment);
  for (const layer of layers) {
    assertTransferableLayerValues(layer, environment);
  }
}

function assertTraceTotals(layers, traceTotals) {
  for (const layer of layers) {
    const expected = traceTotals.get(layer.name);
    if (expected === undefined) continue;
    const actual = sumGrid(layer.originalGridValues);
    if (Math.abs(actual - expected) > TRACE_TOTAL_TOLERANCE) {
      throw new Error(
        `Development "${layer.name}" original grid total ${actual} ` +
        `does not match trace total ${expected}`,
      );
    }
  }
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

function matchingFields(devLayers, prodLayers, fields) {
  try {
    assertMatchingFields(devLayers, prodLayers, fields, "Layer fields");
    return true;
  } catch {
    return false;
  }
}

function layerFieldsMatch(left, right, fields) {
  return fields.every(field => valuesMatch(left[field], right[field]));
}

function groupLayersByName(layers) {
  const groups = new Map();
  for (const layer of layers) {
    groups.set(layer.name, [...(groups.get(layer.name) ?? []), layer]);
  }
  return groups;
}

function createBody(layer) {
  return {
    name: layer.name,
    color: layer.color,
    csv: gridToCsv(layer.gridValues),
    originalCsv: gridToCsv(layer.originalGridValues),
    active: layer.active,
    params: layer.params,
    ...(layer.name2 ? { name2: layer.name2 } : {}),
    ...(layer.description ? { description: layer.description } : {}),
    ...(layer.icon ? { icon: layer.icon } : {}),
    ...(layer.rank != null ? { rank: layer.rank } : {}),
    ...(layer.affiliation ? { affiliation: layer.affiliation } : {}),
    ...(layer.primaryMedium ? { primaryMedium: layer.primaryMedium } : {}),
    ...(layer.gender ? { gender: layer.gender } : {}),
    ...(layer.isAfricanAmerican ? { isAfricanAmerican: true } : {}),
  };
}

async function deleteProductionLayer(layer, purpose) {
  const res = await fetch(`${PROD}/api/layers/${layer.id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(
      `${purpose} "${layer.name}" (id ${layer.id}) -> ${res.status} ${await res.text()}`,
    );
  }
}

async function cleanupStagedLayers(stagedLayers) {
  const failures = [];
  for (const layer of [...stagedLayers].reverse()) {
    try {
      await deleteProductionLayer(layer, "Cleanup failed for staged layer");
    } catch (error) {
      failures.push(error.message);
    }
  }
  if (failures.length) {
    throw new Error(failures.join("\n"));
  }
}

async function reconcileInterruptedFullSync(devLayers, prodLayers) {
  const groups = groupLayersByName(prodLayers);
  const duplicateGroups = [...groups.values()].filter(group => group.length > 1);
  if (duplicateGroups.length === 0) return prodLayers;

  for (const layer of prodLayers) {
    assertTransferableLayerValues(layer, "Production recovery");
  }

  const devByName = indexLayersByName(devLayers, "Development");
  const selected = new Map();
  let hasCompleteReplacementSet = true;
  for (const [name, source] of devByName) {
    const exactCandidates = (groups.get(name) ?? [])
      .filter(candidate => layerFieldsMatch(source, candidate, FULL_SYNC_FIELDS))
      .sort((left, right) => right.id - left.id);
    if (exactCandidates.length === 0) {
      hasCompleteReplacementSet = false;
      break;
    }
    selected.set(name, exactCandidates[0]);
  }

  let staleLayers;
  if (hasCompleteReplacementSet) {
    const selectedIds = new Set([...selected.values()].map(layer => layer.id));
    staleLayers = prodLayers.filter(layer => !selectedIds.has(layer.id));
    console.log(
      `Resuming interrupted full sync: keeping ${selectedIds.size} verified ` +
      `replacement(s) and removing ${staleLayers.length} stale row(s).`,
    );
  } else {
    staleLayers = duplicateGroups.flatMap(group =>
      [...group].sort((left, right) => left.id - right.id).slice(1),
    );
    console.log(
      `Rolling back incomplete staging: removing ${staleLayers.length} ` +
      `duplicate replacement row(s) before retry.`,
    );
  }

  for (const layer of staleLayers) {
    await deleteProductionLayer(layer, "Recovery delete failed for");
  }
  return getJson(`${PROD}/api/layers`);
}

function assertAxisSettings(settings, environment) {
  for (const key of ["axis_x", "axis_z"]) {
    if (settings[key] != null && typeof settings[key] !== "string") {
      throw new Error(`${environment} setting ${key} must be text`);
    }
  }
}

async function reconcileAxisSettings(devSettings, prodSettings) {
  let changed = false;
  for (const key of ["axis_x", "axis_z"]) {
    const desired = devSettings[key];
    if (desired == null || prodSettings[key] === desired) continue;
    const res = await fetch(`${PROD}/api/settings/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: desired }),
    });
    if (!res.ok) {
      throw new Error(`Sync ${key} -> ${res.status} ${await res.text()}`);
    }
    changed = true;
    console.log(`  synced ${key}`);
  }
  if (!changed) return;

  const finalSettings = await getJson(`${PROD}/api/settings`);
  for (const key of ["axis_x", "axis_z"]) {
    const desired = devSettings[key];
    if (desired != null && finalSettings[key] !== desired) {
      throw new Error(`Production setting ${key} does not match development`);
    }
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

async function syncFull(devLayers, prodLayers, traceTotals) {
  // Complete every source and capability check before the first production write.
  assertTransferableLayers(devLayers, "Development");
  assertTraceTotals(devLayers, traceTotals);
  prodLayers = await reconcileInterruptedFullSync(devLayers, prodLayers);
  assertTransferableLayers(prodLayers, "Production");
  const [devSettings, prodSettings] = await Promise.all([
    getJson(`${DEV}/api/settings`),
    getJson(`${PROD}/api/settings`),
  ]);
  assertAxisSettings(devSettings, "Development");
  assertAxisSettings(prodSettings, "Production");
  await reconcileAxisSettings(devSettings, prodSettings);

  if (matchingFields(devLayers, prodLayers, FULL_SYNC_FIELDS)) {
    console.log(`Done. Production already matches all ${devLayers.length} development layers.`);
    return;
  }

  // Stage and verify a complete replacement set while every old row still exists.
  const stagedLayers = [];
  try {
    for (const layer of devLayers) {
      const res = await fetch(`${PROD}/api/layers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createBody(layer)),
      });
      if (!res.ok) {
        throw new Error(
          `Create staged layer "${layer.name}" -> ${res.status} ${await res.text()}`,
        );
      }
      const created = await res.json();
      if (!Number.isInteger(created.id)) {
        throw new Error(`Create staged layer "${layer.name}" returned no numeric id`);
      }
      stagedLayers.push(created);
      assertTransferableLayers([created], "Staged production");
      assertMatchingFields(
        [layer],
        [created],
        FULL_SYNC_FIELDS,
        `Staged production layer "${layer.name}"`,
      );
      console.log(`  staged prod "${layer.name}" (id ${created.id})`);
    }
  } catch (error) {
    try {
      await cleanupStagedLayers(stagedLayers);
    } catch (cleanupError) {
      throw new Error(`${error.message}\n${cleanupError.message}`);
    }
    throw error;
  }

  // Replacements are complete and verified. Removing an old row can no longer
  // make its layer disappear, because its staged replacement is already live.
  for (const layer of prodLayers) {
    await deleteProductionLayer(layer, "Delete old production layer failed for");
    console.log(`  deleted old prod "${layer.name}" (id ${layer.id})`);
  }

  // Verify the final name set and every transferable field.
  const final = await getJson(`${PROD}/api/layers`);
  assertTransferableLayers(final, "Production");
  assertMatchingFields(
    devLayers,
    final,
    FULL_SYNC_FIELDS,
    "Development and production layers",
  );
  console.log(`Done. Prod now has ${final.length} layers: ${final.map((l) => l.name).join(", ")}`);
}

export async function syncProduction({
  mediumOnly = MEDIUM_ONLY,
  traceTotals = null,
} = {}) {
  const devLayers = await getJson(`${DEV}/api/layers`);
  const prodLayers = await getJson(`${PROD}/api/layers`);
  console.log(`Dev layers: ${devLayers.length} | Prod layers: ${prodLayers.length}`);

  if (mediumOnly) {
    await syncMediumMetadata(devLayers, prodLayers);
    return;
  }
  await syncFull(
    devLayers,
    prodLayers,
    traceTotals ?? loadTraceTotals(devLayers.map(layer => layer.name)),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncProduction().catch((err) => {
    console.error("Sync failed:", err.message);
    process.exit(1);
  });
}
