import type { Layer } from "@shared/schema";

/**
 * Keep persisted primary-medium metadata visible to validation and sync tools.
 * Normalizing here would hide legacy database values and make a no-op sync look
 * successful without actually reclassifying the stored row.
 */
export function serializeLayerForApi(layer: Layer) {
  return {
    id: layer.id,
    name: layer.name,
    name2: layer.name2 ?? null,
    description: layer.description ?? null,
    icon: layer.icon ?? null,
    color: layer.color,
    active: layer.active,
    gridValues: JSON.parse(layer.gridValues) as number[][],
    params: layer.params ?? null,
    rank: layer.rank ?? null,
    affiliation: layer.affiliation ?? null,
    primaryMedium: layer.primaryMedium ?? null,
    gender: layer.gender ?? null,
    isAfricanAmerican: layer.isAfricanAmerican,
  };
}