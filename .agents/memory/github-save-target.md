---
name: GitHub save target
description: Which remote to push to when the user says "save to GitHub"
---

## Rule

When the user says "save to GitHub" or "push to GitHub", run `git push` — the `main` branch upstream is set to `data-terrain-v02/main`, so it goes to `https://github.com/innertron/Data-Terrain-V02` automatically.

**Why:** The `github` remote points to the original `innertron/01_DemoScape`. `Data-Terrain-V02` is the active working fork for this project, added as the `data-terrain-v02` remote and set as the default upstream for `main`.

**How to apply:** Never push to `github` remote for saves. Push `main` to `data-terrain-v02`, then compare `git rev-parse main` with `git ls-remote data-terrain-v02 refs/heads/main`. Only say “saved to GitHub” when the hashes match. The Replit Git panel can report no connected provider even while the configured direct remote works, so do not use the panel status as proof either way.

Never print unredacted remote URLs (including `git remote -v`) in tool output.

**Why:** A legacy remote once had an embedded credential in its URL; printing remotes exposed it in tool output. The local URL was sanitized, but older checkpoints or forks may restore unsafe configurations.

**How to apply:** When inspecting remotes, show remote names only or redact URL userinfo before logging. Use a separate authorization header for the active target, without logging its value.
