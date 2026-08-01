// --- ConTour: a named layer of 625 values (one per [xIndex, zIndex] cell) ---
// This is the template. Each ConTour is independent; stacking sums them.

export type ConTourValue = {
  xIndex: number;  // 0–24 (Political Domain axis)
  zIndex: number;  // 0–24 (Income/Education axis)
  value: number;   // Population count for this cell in this layer
};

export type ConTour = {
  id: string;
  name: string;
  color: string; // display color for the layer badge/indicator
  values: ConTourValue[]; // always 625 entries (25×25)
};

// --- Generator: Gaussian hill centred at (cx, cz) with spread sx/sz ---
function gaussian(
  x: number, z: number,
  cx: number, cz: number,
  sx: number, sz: number,
  amplitude: number
): number {
  return Math.round(
    amplitude * Math.exp(
      -((x - cx) ** 2 / (2 * sx ** 2) + (z - cz) ** 2 / (2 * sz ** 2))
    )
  );
}

function makeValues(cx: number, cz: number, sx: number, sz: number, amplitude: number): ConTourValue[] {
  const out: ConTourValue[] = [];
  for (let x = 0; x < 25; x++) {
    for (let z = 0; z < 25; z++) {
      out.push({
        xIndex: x,
        zIndex: z,
        value: Math.max(gaussian(x, z, cx, cz, sx, sz, amplitude), 0),
      });
    }
  }
  return out;
}

// --- 3 Demo ConTours ---
// Each represents a real-world cohort archetype.
// cx = political axis centre (0=far-left, 24=far-right)
// cz = income/edu axis centre (0=high-wealth, 24=low-income)

export const DEMO_CONTOURS: ConTour[] = [
  {
    id: 'contour-urban-left',
    name: 'Young Urban Left',
    color: '#6366f1', // indigo
    // Centre: DEM+1 (x≈10), mid income/college educated (z≈17)
    values: makeValues(10, 17, 4.5, 4, 85),
  },
  {
    id: 'contour-rural-right',
    name: 'Rural Conservative',
    color: '#ef4444', // red
    // Centre: GOP-1 (x≈21), trade/GED income band (z≈5)
    values: makeValues(21, 5, 4, 3.5, 65),
  },
  {
    id: 'contour-affluent-centre',
    name: 'Affluent Centrist',
    color: '#10b981', // emerald
    // Centre: Swing 0 (x≈12), upper-middle income (z≈21)
    values: makeValues(12, 21, 5, 3, 75),
  },
];

// --- Utility: sum active ConTours into a single lookup map ---
// key = "xIndex,zIndex"  value = summed population across all active layers
export function computeEffectiveValues(activeContours: ConTour[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const contour of activeContours) {
    for (const v of contour.values) {
      const key = `${v.xIndex},${v.zIndex}`;
      map.set(key, (map.get(key) ?? 0) + v.value);
    }
  }
  return map;
}
