export type LayerDef = {
  id: number;
  name: string;
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

// Sum active grids, normalize 0-100 → Map<"xIndex,zIndex", value>
// Returns undefined when no layers are active (terrain uses raw DB values)
export function computeLayerValues(
  activeGrids: number[][][]
): Map<string, number> | undefined {
  if (activeGrids.length === 0) return undefined;

  const sums: number[][] = [];
  let min = Infinity, max = -Infinity;

  for (let r = 0; r < 25; r++) {
    sums[r] = [];
    for (let c = 0; c < 25; c++) {
      const s = activeGrids.reduce((a, g) => a + (g[r]?.[c] ?? 0), 0);
      sums[r][c] = s;
      if (s < min) min = s;
      if (s > max) max = s;
    }
  }

  const spread = max - min;
  const result = new Map<string, number>();
  for (let r = 0; r < 25; r++) {
    const zIndex = 24 - r;          // svgRow 0 (top) = z25 = zIndex 24
    for (let c = 0; c < 25; c++) {
      const normalized = spread > 0
        ? Math.round((sums[r][c] - min) / spread * 100)
        : 50;
      result.set(`${c},${zIndex}`, normalized);
    }
  }
  return result;
}
