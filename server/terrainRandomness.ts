export const ZERO_EDGE_RANDOM_RINGS = 3;

type CellNoise = (row: number, col: number, channel: number) => number;

/**
 * Extend randomized terrain into the first three source-zero rings for display.
 * The immutable source grid is used as the footprint, so repeated randomization
 * cannot grow the terrain farther outward.
 */
export function addZeroEdgeRandomBumps(
  randomizedGrid: number[][],
  sourceGrid: number[][],
  bottomFraction: number,
  topFraction: number,
  noise: CellNoise,
): number[][] {
  return randomizedGrid.map((row, rowIndex) => row.map((value, colIndex) => {
    if ((sourceGrid[rowIndex]?.[colIndex] ?? 0) > 0) return value;

    let nearestRing = Infinity;
    let boundaryHeight = 0;
    for (let rowOffset = -ZERO_EDGE_RANDOM_RINGS; rowOffset <= ZERO_EDGE_RANDOM_RINGS; rowOffset++) {
      for (let colOffset = -ZERO_EDGE_RANDOM_RINGS; colOffset <= ZERO_EDGE_RANDOM_RINGS; colOffset++) {
        const ring = Math.max(Math.abs(rowOffset), Math.abs(colOffset));
        if (ring === 0 || ring > ZERO_EDGE_RANDOM_RINGS) continue;
        const sourceHeight = sourceGrid[rowIndex + rowOffset]?.[colIndex + colOffset] ?? 0;
        if (sourceHeight <= 0) continue;
        if (ring < nearestRing) {
          nearestRing = ring;
          boundaryHeight = sourceHeight;
        } else if (ring === nearestRing) {
          boundaryHeight = Math.max(boundaryHeight, sourceHeight);
        }
      }
    }

    if (!Number.isFinite(nearestRing)) return value;

    const ringScale = [0, 0.5, 0.25, 0.1][nearestRing];
    const fraction = bottomFraction + noise(rowIndex, colIndex, 0) * (topFraction - bottomFraction);
    const direction = noise(rowIndex, colIndex, 1) > 0.5 ? 1 : -1;
    const variedScale = Math.max(0.02, ringScale * (1 + direction * fraction));
    return Math.round(boundaryHeight * variedScale * 10000) / 10000;
  }));
}