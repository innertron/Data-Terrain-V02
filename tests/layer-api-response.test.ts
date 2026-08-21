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