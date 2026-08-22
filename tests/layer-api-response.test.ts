import assert from "node:assert/strict";
import test from "node:test";
import type { Layer } from "../shared/schema.ts";
import { serializeLayerForApi } from "../server/layerApiResponse.ts";

function makeStoredLayer(primaryMedium: string): Layer {
  return {
    id: 1,
    name: "Stored Layer",
    name2: null,
    description: null,
    icon: null,
    color: "#a8d4d2",
    gridValues: "[[1]]",
    originalGridValues: "[[1]]",
    active: true,
    params: null,
    rank: 1,
    affiliation: "YouTube",
    gender: "Male",
    isAfricanAmerican: false,
    primaryMedium,
  };
}

test("layer API serialization does not hide persisted legacy media", () => {
  const response = serializeLayerForApi(
    makeStoredLayer("Podcast / YouTube"),
  );

  assert.equal(response.primaryMedium, "Podcast / YouTube");
});

test("layer API serialization exposes the immutable original grid snapshot", () => {
  const stored = makeStoredLayer("Podcast");
  stored.gridValues = "[[0.75]]";
  stored.originalGridValues = "[[1.234567]]";
  stored.active = false;
  stored.params = '{"shape":"circle","amplitude":2}';

  const response = serializeLayerForApi(stored);

  assert.deepEqual(response.gridValues, [[0.75]]);
  assert.deepEqual(response.originalGridValues, [[1.234567]]);
  assert.equal(response.active, false);
  assert.equal(response.params, '{"shape":"circle","amplitude":2}');
});