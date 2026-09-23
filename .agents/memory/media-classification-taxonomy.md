---
name: Media classification taxonomy
description: Approved rule for assigning non-overlapping primary-medium values to current and future personalities.
---

Primary medium must identify exactly one content format: Cable TV, Broadcast TV, Radio, Print, Podcast, or Digital Video. Do not combine a format with YouTube, Spotify, Twitch, Digital, or Social. Treat those as outlet/platform information instead. Leave an unknown primary medium blank rather than guessing.

**Why:** The user confirmed that mixed labels such as Podcast / YouTube, Podcast / Digital, and Print / Digital make filters overlap and become muddled.

**How to apply:** Normalize incoming layer metadata and classification charts before import. Reject unsupported nonblank medium labels so future layers cannot silently reintroduce overlapping categories.

Keep the single primary medium even when a person works in multiple content formats. Record confirmed other formats separately as additional searchable media; do not replace the primary with a combined string.

**Why:** The user wants the same person to appear under both Radio and Podcast (or Cable TV and Radio) filters while preserving the prior one-format primary classification.

**How to apply:** Add only explicitly supplied secondary formats, and ensure the filter matches either the primary or an additional format. Do not infer platforms or outlets as media formats.