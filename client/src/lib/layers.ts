export type LayerDef = {
  id: string;
  name: string;
  url: string;
  color: string;
};

export const LAYER_DEFS: LayerDef[] = [
  { id: 'l1', name: 'Layer 1 — Circle',          url: '/grid-circle.csv',  color: '#818cf8' },
  { id: 'l2', name: 'Layer 2 — Quarter Arc',      url: '/grid-layer2.csv', color: '#f87171' },
  { id: 'l3', name: 'Layer 3 — Diagonal Ellipse', url: '/grid-layer3.csv', color: '#34d399' },
];

// Parse a 25×25 CSV into grid[svgRow][svgCol] (row 0 = top = z25)
export async function fetchLayerGrid(url: string): Promise<number[][]> {
  const res = await fetch(url, { cache: 'no-store' });
  const text = await res.text();
  return text.trim().split('\n').slice(1).map(l => l.split(',').map(Number));
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
