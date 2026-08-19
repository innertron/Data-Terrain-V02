// sync-prod.js — mirror the dev database layers to production.
// Usage: node scripts/sync-prod.js
// Reads all layers from the local dev server and replaces the production
// layers with exact copies (grid values, rank, affiliation, medium, name2,
// description, icon, demographic). Production ends up identical to dev.

const DEV = "http://localhost:5000";
const PROD = "https://data-terrain-v-02.replit.app";

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

function gridToCsv(grid) {
  const header = Array.from({ length: 25 }, (_, i) => `x${i + 1}`).join(",");
  return header + "\n" + grid.map((r) => r.join(",")).join("\n");
}

async function main() {
  const devLayers = await getJson(`${DEV}/api/layers`);
  const prodLayers = await getJson(`${PROD}/api/layers`);
  console.log(`Dev layers: ${devLayers.length} | Prod layers: ${prodLayers.length}`);

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
      ...(l.demographic ? { demographic: l.demographic } : {}),
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

    // 3. Copy secondary meta (name2, description, icon, demographic) if present
    if (l.name2 || l.description || l.icon || l.demographic) {
      const patch = await fetch(`${PROD}/api/layers/${created.id}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: l.name,
          ...(l.name2 ? { name2: l.name2 } : {}),
          ...(l.description ? { description: l.description } : {}),
          ...(l.icon ? { icon: l.icon } : {}),
          ...(l.demographic ? { demographic: l.demographic } : {}),
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
  console.log(`Done. Prod now has ${final.length} layers: ${final.map((l) => l.name).join(", ")}`);
}

main().catch((err) => {
  console.error("Sync failed:", err.message);
  process.exit(1);
});
