import assert from "node:assert/strict";
import test from "node:test";
import { newLayerSchema } from "../server/layerCreationSchema.ts";
import { PRIMARY_MEDIA } from "../shared/mediaTaxonomy.ts";

const requiredLayerFields = {
  name: "Test Layer",
  color: "#a8d4d2",
  csv: "x1\n1",
};

test("layer creation accepts every canonical primary medium", () => {
  for (const primaryMedium of PRIMARY_MEDIA) {
    const result = newLayerSchema.safeParse({
      ...requiredLayerFields,
      primaryMedium,
    });
    assert.equal(result.success, true, primaryMedium);
  }
});

test("layer creation rejects legacy overlapping medium labels", () => {
  for (const primaryMedium of [
    "TV",
    "Print / Digital",
    "Podcast / YouTube",
    "Podcast / Digital",
    "Podcast / Social",
  ]) {
    const result = newLayerSchema.safeParse({
      ...requiredLayerFields,
      primaryMedium,
    });
    assert.equal(result.success, false, primaryMedium);
  }
});

test("layer creation accepts exact-sync state and rejects invalid params", () => {
  const exactState = newLayerSchema.safeParse({
    ...requiredLayerFields,
    originalCsv: "x1\n1.234567",
    active: false,
    params: '{"shape":"circle","amplitude":2}',
  });
  assert.equal(exactState.success, true);

  const invalidParams = newLayerSchema.safeParse({
    ...requiredLayerFields,
    params: "{not-json}",
  });
  assert.equal(invalidParams.success, false);
});