import type { PrimaryMedium } from "@shared/mediaTaxonomy";

export type LayerDef = {
  id: number;
  name: string;
  name2?: string | null;        // Short subtitle
  description?: string | null;  // Long description
  icon?: string | null;         // Base64 data URL for round icon
  color: string;
  active: boolean;
  gridValues: number[][];
  params?: string | null;       // JSON: stored algorithm params incl. skew bounds
  rank?: number | null;         // 1-74 overall rank
  affiliation?: string | null;  // Outlet/platform, e.g. FOX, NPR, SPOTIFY
  primaryMedium?: PrimaryMedium | null; // One mutually exclusive primary format
  gender?: string | null;       // Male / Female
  isAfricanAmerican?: boolean;  // true when included in this demographic filter
};

export type LayerFilters = {
  media: readonly PrimaryMedium[];
  genders: readonly string[];
  africanAmericanOnly: boolean;
  affiliations: readonly string[];
  nameSearch: string;
};

export type FilteredLayerState = {
  visibleLayers: LayerDef[];
  terrainLayers: LayerDef[];
  effectiveActiveIds: number[];
};

function normalizeAffiliation(value: string): string {
  const normalized = value.toUpperCase().replace(/[^A-Z]/g, "");
  return normalized === "FOX" ? "FOXNEWS" : normalized;
}

function matchesTerrainFilters(layer: LayerDef, filters: LayerFilters): boolean {
  const affiliationMatches =
    filters.affiliations.length === 0 ||
    (!!layer.affiliation &&
      filters.affiliations.some(
        affiliation =>
          normalizeAffiliation(affiliation) ===
          normalizeAffiliation(layer.affiliation as string),
      ));

  return (
    (filters.media.length === 0 ||
      (!!layer.primaryMedium && filters.media.includes(layer.primaryMedium))) &&
    (filters.genders.length === 0 ||
      (!!layer.gender && filters.genders.includes(layer.gender))) &&
    (!filters.africanAmericanOnly || layer.isAfricanAmerican === true) &&
    affiliationMatches
  );
}

/**
 * Apply Inspector filters to the list and terrain together.
 * Name search intentionally narrows only the visible list.
 */
export function getFilteredLayerState(
  layers: LayerDef[],
  activeLayerIds: readonly number[],
  filters: LayerFilters,
): FilteredLayerState {
  const terrainLayers = layers.filter(layer =>
    matchesTerrainFilters(layer, filters),
  );
  const query = filters.nameSearch.trim().toLowerCase();
  const visibleLayers = terrainLayers
    .filter(layer => query === "" || layer.name.toLowerCase().includes(query))
    .sort((a, b) => {
      const rankA = a.rank;
      const rankB = b.rank;
      if (rankA == null && rankB == null) return 0;
      if (rankA == null) return 1;
      if (rankB == null) return -1;
      return rankA - rankB;
    });

  const hasTerrainFilters =
    filters.media.length > 0 ||
    filters.genders.length > 0 ||
    filters.africanAmericanOnly ||
    filters.affiliations.length > 0;
  const matchingIds = new Set(terrainLayers.map(layer => layer.id));
  const effectiveActiveIds = hasTerrainFilters
    ? activeLayerIds.filter(id => matchingIds.has(id))
    : [...activeLayerIds];

  return { visibleLayers, terrainLayers, effectiveActiveIds };
}

/** Fetch all layers (with grid data) from the API */
export async function fetchLayers(): Promise<LayerDef[]> {
  const res = await fetch("/api/layers", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch layers: ${res.status}`);
  return res.json();
}

const CLIFF_JUMP_THRESHOLD = 15;
const TERRAIN_DISPLAY_MAX_HEIGHT = 75;
const TERRAIN_DISPLAY_GAMMA = 0.65;

/**
 * Compress normalized terrain heights for rendering only. The current peak
 * (100) renders at 75 while smaller positive heights are gently lifted by a
 * power curve. Zero remains zero so the geographic footprint is preserved.
 */
export function compressTerrainHeights(values: number[][]): number[][] {
  return values.map(row => row.map(value => {
    if (value <= 0) return 0;
    return Math.round(
      TERRAIN_DISPLAY_MAX_HEIGHT *
      Math.pow(Math.min(value, 100) / 100, TERRAIN_DISPLAY_GAMMA),
    );
  }));
}

/**
 * Integrate abrupt display-height transitions without changing stored layer
 * values. A zero bordering positive terrain is lifted halfway toward that
 * neighbor while the upper cell drops by one quarter of the gap. Larger tier
 * jumps are then projected toward a maximum 15-point step, raising the low
 * side and lowering the high side equally. Gradual slopes and distant zero
 * regions are unchanged.
 */
export function blendTerrainTransitions(values: number[][]): number[][] {
  const zeroEdgeProposals: number[][][] = Array.from(
    { length: 25 },
    () => Array.from({ length: 25 }, () => [] as number[]),
  );

  // First build the requested half-height transition at zero boundaries.
  for (let row = 0; row < 25; row++) {
    for (let col = 0; col < 25; col++) {
      for (const [rowOffset, colOffset] of [[1, 0], [0, 1]]) {
        const nextRow = row + rowOffset;
        const nextCol = col + colOffset;
        if (nextRow >= 25 || nextCol >= 25) continue;

        const current = values[row][col];
        const next = values[nextRow][nextCol];
        if (current === next) continue;

        const currentIsLow = current < next;
        const low = currentIsLow ? current : next;
        const high = currentIsLow ? next : current;
        if (low !== 0 || high <= 0) continue;

        const lowTarget = high * 0.5;
        const highTarget = high * 0.75;
        const lowRow = currentIsLow ? row : nextRow;
        const lowCol = currentIsLow ? col : nextCol;
        const highRow = currentIsLow ? nextRow : row;
        const highCol = currentIsLow ? nextCol : col;
        zeroEdgeProposals[lowRow][lowCol].push(lowTarget);
        zeroEdgeProposals[highRow][highCol].push(highTarget);
      }
    }
  }

  const blended = values.map((line, row) => line.map((value, col) => {
    const targets = zeroEdgeProposals[row][col];
    if (targets.length === 0) return value;
    return targets.reduce((sum, target) => sum + target, 0) / targets.length;
  }));

  // Project only abrupt shared edges toward the maximum permitted step.
  // Alternating sweep direction avoids favoring one side of the grid.
  const edges: Array<[number, number, number, number]> = [];
  for (let row = 0; row < 25; row++) {
    for (let col = 0; col < 25; col++) {
      if (row < 24) edges.push([row, col, row + 1, col]);
      if (col < 24) edges.push([row, col, row, col + 1]);
    }
  }

  for (let pass = 0; pass < 100; pass++) {
    let largestExcess = 0;
    const orderedEdges = pass % 2 === 0 ? edges : [...edges].reverse();
    for (const [rowA, colA, rowB, colB] of orderedEdges) {
      const valueA = blended[rowA][colA];
      const valueB = blended[rowB][colB];
      const difference = valueA - valueB;
      const excess = Math.abs(difference) - CLIFF_JUMP_THRESHOLD;
      if (excess <= 0) continue;

      const transfer = excess / 2;
      largestExcess = Math.max(largestExcess, excess);
      if (difference > 0) {
        blended[rowA][colA] -= transfer;
        blended[rowB][colB] += transfer;
      } else {
        blended[rowA][colA] += transfer;
        blended[rowB][colB] -= transfer;
      }
    }
    if (largestExcess < 0.01) break;
  }

  return blended.map((line) => line.map((value) => Math.round(value)));
}

// Sum active grids per cell, normalize 0-100 using the active layers' own bounds.
// Returns undefined when no layers are loaded yet.
export function computeLayerValues(
  activeGrids: number[][][],
  _allGrids?: number[][][]
): Map<string, number> | undefined {
  if (activeGrids.length === 0) return undefined;

  const nActive = activeGrids.length;

  // Step 1: sum active grids and find min/max within the active set
  let globalMin = Infinity, globalMax = -Infinity;
  const sums: number[][] = [];
  for (let r = 0; r < 25; r++) {
    sums[r] = [];
    for (let c = 0; c < 25; c++) {
      const sum = activeGrids.reduce((a, g) => a + (g[r]?.[c] ?? 0), 0);
      sums[r][c] = sum;
      if (sum < globalMin) globalMin = sum;
      if (sum > globalMax) globalMax = sum;
    }
  }

  // Step 2: normalize 0-100 against the active-layer range
  const spread = globalMax - globalMin;
  const normalizedGrid = sums.map((row) => row.map((sum) => (
    spread > 0
      ? Math.max(0, Math.round((sum - globalMin) / spread * 100))
      : 50
  )));
  // Rendering-only display pipeline: compress the overall height range, then
  // preserve the approved zero-edge and steep-tier transition treatment.
  const displayGrid = blendTerrainTransitions(
    compressTerrainHeights(normalizedGrid),
  );
  const result = new Map<string, number>();
  for (let r = 0; r < 25; r++) {
    const zIndex = 24 - r;
    for (let c = 0; c < 25; c++) {
      result.set(`${c},${zIndex}`, displayGrid[r][c]);
    }
  }
  return result;
}
