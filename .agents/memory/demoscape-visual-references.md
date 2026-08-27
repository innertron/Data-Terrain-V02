---
name: DemoScape visual references
description: How to use rough user renderings when implementing new DemoScape interactions.
---

Use the user's rough rendering as the primary interaction reference when a new DemoScape control affects terrain highlighting, color, or elevation.

**Why:** The user confirmed that taking time to interpret the rendering produced the intended result. The image clarified the difference between ordinary data filtering and preserving grayscale context, highlighted axis strands, and raised intersection cells.

**How to apply:** Before implementing a visually complex DemoScape interaction, identify the states shown in the rendering and translate each state into explicit color, elevation, and control behavior without redesigning unrelated parts of the interface.