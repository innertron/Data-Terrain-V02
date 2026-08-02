---
name: GitHub save target
description: Which remote to push to when the user says "save to GitHub"
---

## Rule

When the user says "save to GitHub" or "push to GitHub", run `git push` — the `main` branch upstream is set to `data-terrain-v02/main`, so it goes to `https://github.com/innertron/Data-Terrain-V02` automatically.

**Why:** The `github` remote points to the original `innertron/01_DemoScape`. `Data-Terrain-V02` is the active working fork for this project, added as the `data-terrain-v02` remote and set as the default upstream for `main`.

**How to apply:** Never push to `github` remote for saves. Just `git push`.
