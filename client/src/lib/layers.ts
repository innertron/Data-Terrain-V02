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
  affiliation?: string | null;  // e.g. FOX, NBC, NPR
  primaryMedium?: string | null;// Cable TV, Podcast / YouTube, Radio, etc.
  gender?: string | null;       // Male / Female
  isAfricanAmerican?: boolean;  // true when included in this demographic filter
};

export type LayerFilters = {
  media: readonly string[];
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
  const result = new Map<string, number>();
  for (let r = 0; r < 25; r++) {
    const zIndex = 24 - r;
    for (let c = 0; c < 25; c++) {
      const normalized = spread > 0
        ? Math.max(0, Math.round((sums[r][c] - globalMin) / spread * 100))
        : 50;
      result.set(`${c},${zIndex}`, normalized);
    }
  }
  return result;
}
