export type LayerDef = {
  id: number;
  name: string;
  name2?: string | null;        // Short subtitle
  description?: string | null;  // Long description
  icon?: string | null;         // Base64 data URL for round icon
  color: string;
  active: boolean;
  gridValues: number[][];
  params?: string | null; // JSON: stored algorithm params incl. skew bounds
};

/** Fetch all layers (with grid data) from the API */
export async function fetchLayers(): Promise<LayerDef[]> {
  const res = await fetch("/api/layers", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch layers: ${res.status}`);
  return res.json();
}

// Average active grids per cell, normalize 0-100 using ALL-layer bounds.
// allGrids sets the fixed reference scale so a single layer always shows
// its proportional height relative to the full combined average.
// Returns undefined when no layers are loaded yet.
export function computeLayerValues(
  activeGrids: number[][][],
  allGrids: number[][][]
): Map<string, number> | undefined {
  if (activeGrids.length === 0) return undefined;

  const nAll = allGrids.length;
  const nActive = activeGrids.length;

  // Step 1: global min/max from the full combined average (all layers)
  let globalMin = Infinity, globalMax = -Infinity;
  for (let r = 0; r < 25; r++) {
    for (let c = 0; c < 25; c++) {
      const allAvg = allGrids.reduce((a, g) => a + (g[r]?.[c] ?? 0), 0) / nAll;
      if (allAvg < globalMin) globalMin = allAvg;
      if (allAvg > globalMax) globalMax = allAvg;
    }
  }

  // Step 2: active-layer average, normalized against the global scale
  const spread = globalMax - globalMin;
  const result = new Map<string, number>();
  for (let r = 0; r < 25; r++) {
    const zIndex = 24 - r;
    for (let c = 0; c < 25; c++) {
      const activeAvg = activeGrids.reduce((a, g) => a + (g[r]?.[c] ?? 0), 0) / nActive;
      const normalized = spread > 0
        ? Math.max(0, Math.round((activeAvg - globalMin) / spread * 100))
        : 50;
      result.set(`${c},${zIndex}`, normalized);
    }
  }
  return result;
}
