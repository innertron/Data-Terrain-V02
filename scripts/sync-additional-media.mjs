// Run only after publishing the additional_media schema and API change.
// Usage: node scripts/sync-additional-media.mjs <published-app-url>
// Updates only the names listed in the two manifests; never mirrors terrains.
import fs from "node:fs/promises";

const base = process.argv[2]?.replace(/\/$/, "");
if (!base || !/^https:\/\//.test(base)) {
  throw new Error("Provide the published app's HTTPS URL");
}

const manifestFiles = [
  "../data/layer-additional-media-2026-09-23.json",
  "../data/layer-batch-2026-09-24-radio-podcasts.json",
];
const metadataUpdates = (await Promise.all(manifestFiles.map(async file => {
  const manifest = JSON.parse(await fs.readFile(new URL(file, import.meta.url), "utf8"));
  return manifest.metadataUpdates;
}))).flat();
if (new Set(metadataUpdates.map(update => update.name)).size !== metadataUpdates.length) {
  throw new Error("Duplicate name across additional-media manifests");
}
const getLayers = async () => {
  const response = await fetch(`${base}/api/layers`, { cache: "no-store" });
  if (!response.ok) throw new Error(`GET layers: ${response.status}`);
  return response.json();
};

const before = await getLayers();
if (!Array.isArray(before) || !before.every(layer => Array.isArray(layer.additionalMedia))) {
  throw new Error("Published app does not support additionalMedia yet; publish the new version first");
}

const updates = [];
for (const entry of metadataUpdates) {
  const matches = before.filter(layer => layer.name === entry.name);
  if (matches.length !== 1) throw new Error(`Expected one published layer named ${entry.name}`);
  const layer = matches[0];
  if (entry.additionalMedia.includes(layer.primaryMedium)) {
    throw new Error(`Additional media overlaps the primary medium for ${entry.name}`);
  }
  updates.push({ layer, additionalMedia: entry.additionalMedia });
}

for (const { layer, additionalMedia } of updates) {
  if (JSON.stringify(layer.additionalMedia) === JSON.stringify(additionalMedia)) continue;
  const response = await fetch(`${base}/api/layers/${layer.id}/rename`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ additionalMedia }),
  });
  if (!response.ok) throw new Error(`PATCH ${layer.name}: ${response.status} ${await response.text()}`);
  console.log(`updated ${layer.name}`);
}

const after = await getLayers();
if (after.length !== before.length) throw new Error("Layer count changed during sync");
for (const { layer, additionalMedia } of updates) {
  const saved = after.find(candidate => candidate.id === layer.id);
  if (!saved || JSON.stringify(saved.additionalMedia) !== JSON.stringify(additionalMedia)) {
    throw new Error(`Additional media did not persist for ${layer.name}`);
  }
  const { additionalMedia: _old, ...otherBefore } = layer;
  const { additionalMedia: _new, ...otherAfter } = saved;
  if (JSON.stringify(otherBefore) !== JSON.stringify(otherAfter)) {
    throw new Error(`Unexpected non-media changes for ${layer.name}`);
  }
}
console.log(`Verified ${updates.length} published layers; all other fields unchanged`);