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

**How to apply:** When inspecting remotes, show remote names only or redact URL userinfo before logging. Supply credentials to Git non-interactively without logging their value or persisting them in remote configuration.

Plain pushes can fail authentication even when the workspace already has a GitHub secret available. An ephemeral Git credential helper supplied from the environment succeeded without storing or displaying its value.

**Why:** The configured remote alone does not guarantee that Git receives the available authorization.

**How to apply:** If a plain push fails, use the workspace-provided secret through a one-command credential helper; do not print credentials or put them in a remote URL.
