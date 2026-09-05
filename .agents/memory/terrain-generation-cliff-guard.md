---
name: Terrain generation cliff guard
description: Required validation against artificial same-band cliffs introduced by radial post-processing.
---

Terrain generation must fail closed when radial post-processing turns a mild base-RBF gradient into an abrupt transition between adjacent cells painted in the same positive source band. Audit all saved traces, not only a reported layer.

**Why:** A spot check exposed an artificial cliff that did not exist in the painted partition, and a full historical audit found the same failure mode in additional asymmetric terrains. Layer-specific visual checks are not sufficient.

**How to apply:** Keep the full saved-trace rebuild test and generator-level same-band cliff guard active. For a flagged asymmetric source, review it and explicitly disable radial treatment per trace; then revalidate total, zero mask, orientation, top-band peak, and live working/immutable grids.