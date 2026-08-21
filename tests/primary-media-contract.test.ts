import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { PRIMARY_MEDIA } from "../shared/mediaTaxonomy.ts";
// @ts-expect-error The production sync is an executable JavaScript module.
import { assertCanonicalMedia } from "../scripts/sync-prod.js";

const require = createRequire(import.meta.url);
const scriptMedia = require("../scripts/primary-media.cjs") as {
  PRIMARY_MEDIA: readonly string[];
};

test("application and command-line tools use the same primary-media taxonomy", () => {
  assert.deepEqual(scriptMedia.PRIMARY_MEDIA, PRIMARY_MEDIA);
});

test("metadata sync rejects raw legacy media instead of masking them", () => {
  assert.throws(
    () =>
      assertCanonicalMedia(
        [{ name: "Legacy Layer", primaryMedium: "Podcast / YouTube" }],
        "Production",
      ),
    /Production contains invalid primary media: Legacy Layer \(Podcast \/ YouTube\)/,
  );
});