import assert from "node:assert/strict";
import test from "node:test";
import {
  getFilteredLayerState,
  type LayerDef,
  type LayerFilters,
} from "../client/src/lib/layers.ts";

const gridValues = [[1]];

const layers: LayerDef[] = [
  {
    id: 1,
    name: "Alice Anchor",
    color: "#111111",
    active: true,
    gridValues,
    rank: 2,
    affiliation: "FOX",
    primaryMedium: "Cable TV",
    gender: "Female",
    isAfricanAmerican: true,
  },
  {
    id: 2,
    name: "Bob Broadcaster",
    color: "#222222",
    active: true,
    gridValues,
    rank: 1,
    affiliation: "CNN",
    primaryMedium: "Cable TV",
    gender: "Male",
    isAfricanAmerican: false,
  },
  {
    id: 3,
    name: "Carla Creator",
    color: "#333333",
    active: false,
    gridValues,
    rank: 3,
    affiliation: "Fox News",
    primaryMedium: "Radio",
    gender: "Female",
    isAfricanAmerican: true,
  },
  {
    id: 4,
    name: "Diana Digital",
    color: "#444444",
    active: true,
    gridValues,
    rank: 4,
    affiliation: "CNN",
    primaryMedium: "Cable TV",
    gender: "Female",
    isAfricanAmerican: true,
  },
  {
    id: 5,
    name: "Unclassified Host",
    color: "#555555",
    active: true,
    gridValues,
  },
];

const clearFilters: LayerFilters = {
  media: [],
  genders: [],
  africanAmericanOnly: false,
  affiliations: [],
  nameSearch: "",
};

test("combined demographic, gender, medium, and affiliation filters keep list and terrain aligned", () => {
  const state = getFilteredLayerState(layers, [1, 2, 4, 5], {
    ...clearFilters,
    media: ["Cable TV", "Radio"],
    genders: ["Female"],
    africanAmericanOnly: true,
    affiliations: ["Fox News", "CNN"],
  });

  assert.deepEqual(
    state.visibleLayers.map(layer => layer.id),
    [1, 3, 4],
  );
  assert.deepEqual(
    state.terrainLayers.map(layer => layer.id),
    [1, 3, 4],
  );
  assert.deepEqual(state.effectiveActiveIds, [1, 4]);
});

test("clearing all terrain filters restores every active eligible layer", () => {
  const state = getFilteredLayerState(
    layers,
    [1, 2, 4, 5],
    clearFilters,
  );

  assert.deepEqual(
    state.terrainLayers.map(layer => layer.id),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(state.effectiveActiveIds, [1, 2, 4, 5]);
});

test("name search narrows only the visible list and never changes terrain", () => {
  const baseline = getFilteredLayerState(
    layers,
    [1, 2, 4, 5],
    clearFilters,
  );
  const searched = getFilteredLayerState(layers, [1, 2, 4, 5], {
    ...clearFilters,
    nameSearch: "alice",
  });

  assert.deepEqual(
    searched.visibleLayers.map(layer => layer.id),
    [1],
  );
  assert.deepEqual(searched.terrainLayers, baseline.terrainLayers);
  assert.deepEqual(
    searched.effectiveActiveIds,
    baseline.effectiveActiveIds,
  );
});