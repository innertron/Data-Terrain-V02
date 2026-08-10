---
name: Post-merge UI regressions
description: UI behaviors that task-agent merges have overwritten; re-check after every merge
---

Task merges have repeatedly replaced working UI with regressed versions. After ANY task merge, re-verify:

- Domain popup font: must be **11pt** (a merge downgraded it to 11px "that no one can read").
- Popup theming: light mode = white bg / true black text for both popups; dark mode = political white-on-black, income black-on-white.
- Segment selection lock: hover updates the Political/Income boxes live, but a **click locks the selection for 3 seconds** (selectionLockRef in Landscape3D) so the user can read the boxes. A merge once made hover call onSelectSegment unconditionally, breaking the hold.
- Layer row colors (see layer-row-colors.md).

**Why:** User discovered both the tiny font and the broken click-hold immediately after the Task #10-era merge; fixing after the fact costs trust.

**How to apply:** After every merge commit lands, grep Home.tsx for `fontSize: '11pt'` and Landscape3D.tsx for `selectionLockRef`; restore if missing, commit, push to data-terrain-v02/main.
