---
name: Published layer-list size limit
description: Production response-size failure caused by including all portraits inline in the layer list.
---

The published layer-list endpoint can return an opaque HTTP 500 when its JSON response grows past approximately 32 MiB. Base64 portraits dominate that response. The app may still accept new records and report HTTP 201 even though its next full-list request fails.

**Why:** During a layer import, the live list worked below roughly 32 MiB, failed reproducibly once another full-size portrait pushed it above that boundary, and worked again after using smaller display copies. This is a response-size problem, not a failed terrain import.

**How to apply:** Before adding or replacing portraits, measure the complete published response size and verify that a full list still loads. Preserve original supplied images as replayable sources; optimized display images are a temporary workaround. A durable fix should stop embedding every portrait in the list response, with compatibility and publishing handled deliberately.

When replacing a live layer through the API near this limit, stage the new grid without a duplicate inline portrait, verify it, remove the old record, then restore the unchanged portrait and final metadata on the staged record.

**Why:** Temporarily staging a full duplicate portrait can push the list over the response boundary even if the final replacement is the same size.

**How to apply:** Check response headroom before staging; keep a complete snapshot of the old record for recovery; verify the final list and all unaffected records after the swap.