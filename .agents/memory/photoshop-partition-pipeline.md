---
name: Photoshop partition pipeline
description: User paints band partitions as PNGs in Photoshop; how to extract the 25×25 grid reliably.
---

The user's preferred input for new layers (after 9 failed methodologies): a Photoshop-painted PNG of the 25×25 band partition, plus a circular icon PNG. **This is the confirmed working format — do not push back to text lists.**

**User confirmed (Aug 14 2026) this format is PERMANENT and IDENTICAL for every remaining layer**: always these exact colors, always 7 bands + #EEEEEE zero cells, same template/layout. When a painted partition PNG arrives, run the extraction pipeline immediately — no need to re-ask about format, colors, or band count.

**Template**: `attached_assets/generated/partition-template.png` (920×980, title space at top, unlabeled legend swatches, board all #EEEEEE). Titles are Helvetica Bold ~20px.

**Canonical band colors (high→low)**: #7F0000, #D7301F, #FC8D59, #FDCC8A, #FFFFB2, #C7E9B4, #7FCDBB; zero/empty #EEEEEE.

**Extraction lessons (all hit on the first real file, David Muir):**
- Photoshop color-profile conversion SHIFTS some hexes (e.g. #FC8D59→#F8B191, #C7E9B4→#D6EBC9). Never exact-match; take the image's dominant colors, map 1:1 to bands by known correspondence, then nearest-match per cell. Beware: shifted colors can be *closer to a different canonical band* than their own.
- White #FFFFFF is only ~29 RGB-distance from #EEEEEE — board-bbox detection must use a tight threshold (<15) or the whole white canvas is "board".
- Screenshots have non-square outer bboxes (axis labels leak in). Derive cell height from cell width (cells are square); verify with a pixel-column scan across a known color transition.
- Per cell: majority vote over a small sample block at cell center; flag any cell with split votes as ambiguous and STOP if any remain. Success = 625/625, 0 ambiguous.
- After extraction, regenerate the partition plot from the extracted bands and present it so the user can visually diff against what they painted.

**Extraction is now scripted**: `node scripts/extract-partition.cjs <png> <7 band values high->low, comma-sep>` → points JSON on stdout (exits nonzero on any ambiguous cell). Works on 2x retina screenshots; user re-confirmed the whole flow Aug 16 2026.

**Then run the normal pipeline**: traces = all 625 cells [x, z, bandValue] → `generateGridFromTraces` (totalMillions from title) → peak-in-top-band check → POST layer → roundtrip verify → icon/meta patch → save `data/<name>-trace-points.json` → sync-prod.

**Coordinate rule:** trace Z coordinates map directly to storage rows: one-based Z1 → row 0; legacy zero-based Z0 → row 0. Do not reverse Z when applying or auditing painted masks. The app performs its own HIGH→LOW display-index reversal later.

**Why:** A mask repair once reversed trace Z a second time. Its audit repeated the same bad transform and falsely reported zero leaks, while visibly distorting Krystal Ball.

**How to apply:** Validate masks using `row = z - 1` for one-based traces and `row = z` for zero-based traces. Independently assert that the regenerated peak remains inside the painted top-band coordinates.

Filename convention: rank prefix (e.g. `5_David_Muir_*.png`); viewership millions in the painted title (typos like "13/854611M" mean 13.854611M — confirm with user if unclear).

## RBF radial transition rule
Use the established radial transition treatment automatically for interior-peaked RBF grids. Apply it after RBF interpolation and before restoring explicit painted-zero cells. Skip edge/ridge layers.

**Why:** Removing this treatment left abrupt high/low seams and introduced a visible unsupported trough in the rendered terrain. The user explicitly directed that the prior treatment be restored.

**How to apply:** Generate from the painted trace with RBF, apply the radial transition pass, restore every source-zero cell, then rescale to the exact ViewerScore total and validate orientation and peak placement. Do not remove this treatment based only on numeric plateau metrics; rendered terrain continuity must be checked.
