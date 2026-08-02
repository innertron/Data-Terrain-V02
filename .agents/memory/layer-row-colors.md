---
name: Layer row colors
description: Layer rows in the Inspector must always use #a8d4d2 (muted teal) for dot/toggle/tint, never individual DB colors. Text must be black (text-black dark:text-white).
---

# Layer row colors — do not revert

**Rule:** All layer rows in the Inspector LAYERS panel must use `#a8d4d2` (muted teal) for every color element — dot, toggle background, and active-row tint. The `layer.color` field from the DB (purple `#818cf8`, red `#f87171`, green `#34d399`) must NOT be used in the UI.

**Why:** User explicitly requested this on 2026-08-01 ("change them to all one color"). Task agents (#4, #5) have each reverted this to individual colors after their merges. This has caused repeated frustration.

**How to apply:** After any task agent merge that touches the layer row UI in `client/src/pages/Home.tsx`, verify the three color references are `#a8d4d2`:
1. Active-row background tint: `backgroundColor: '#a8d4d218'`
2. Active-row border: `borderColor: '#a8d4d255'`
3. Dot: `backgroundColor: '#a8d4d2'`
4. Toggle: `backgroundColor: '#a8d4d2'`
5. Text: `className="... text-black dark:text-white ..."`

Never use `layer.color` for any visible UI element in the layer rows.
