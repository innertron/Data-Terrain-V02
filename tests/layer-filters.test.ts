import assert from "node:assert/strict";
import test from "node:test";
import {
  getFilteredLayerState,
  type LayerDef,
  type LayerFilters,
} from "../client/src/lib/layers.ts";
import {
  PRIMARY_MEDIA,
  normalizePrimaryMedium,
} from "../shared/mediaTaxonomy.ts";

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
  {
    id: 6,
    name: "Brooke Broadcast",
    color: "#666666",
    active: true,
    gridValues,
    affiliation: "ABC",
    primaryMedium: "Broadcast TV",
    gender: "Female",
    isAfricanAmerican: false,
  },
  {
    id: 7,
    name: "Peter Print",
    color: "#777777",
    active: true,
    gridValues,
    affiliation: "NYT",
    primaryMedium: "Print",
    gender: "Male",
    isAfricanAmerican: false,
  },
  {
    id: 8,
    name: "Priya Podcast",
    color: "#888888",
    active: true,
    gridValues,
    affiliation: "Spotify",
    primaryMedium: "Podcast",
    gender: "Female",
    isAfricanAmerican: false,
  },
  {
    id: 9,
    name: "Diego Digital",
    color: "#999999",
    active: true,
    gridValues,
    affiliation: "YouTube",
    primaryMedium: "Digital Video",
    gender: "Male",
    isAfricanAmerican: false,
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

test("each primary-medium filter selects only its distinct content format", () => {
  const activeIds = layers.filter(layer => layer.active).map(layer => layer.id);

  for (const medium of PRIMARY_MEDIA) {
    const state = getFilteredLayerState(layers, activeIds, {
      ...clearFilters,
      media: [medium],
    });
    const expectedLayers = layers.filter(layer => layer.primaryMedium === medium);

    assert.deepEqual(
      state.terrainLayers.map(layer => layer.id),
      expectedLayers.map(layer => layer.id),
      `${medium} should not overlap another primary format`,
    );
    assert(
      state.terrainLayers.every(layer => layer.primaryMedium === medium),
      `${medium} returned a layer from another primary format`,
    );
  }
});

test("clearing all terrain filters restores every active eligible layer", () => {
  const state = getFilteredLayerState(
    layers,
    [1, 2, 4, 5],
    clearFilters,
  );

  assert.deepEqual(
    state.terrainLayers.map(layer => layer.id),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
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

test("primary-medium categories are distinct and legacy labels normalize consistently", () => {
  assert.deepEqual(PRIMARY_MEDIA, [
    "Cable TV",
    "Broadcast TV",
    "Radio",
    "Print",
    "Podcast",
    "Digital Video",
  ]);
  assert.equal(normalizePrimaryMedium("TV"), "Cable TV");
  assert.equal(normalizePrimaryMedium("Print / Digital"), "Print");
  assert.equal(normalizePrimaryMedium("Podcast / YouTube"), "Podcast");
  assert.equal(normalizePrimaryMedium("Podcast / Digital"), "Podcast");
  assert.equal(normalizePrimaryMedium("Podcast / Social"), "Podcast");
  assert.equal(normalizePrimaryMedium("Podcast / Radio"), "Podcast");
  assert.equal(normalizePrimaryMedium(""), null);
  assert.equal(normalizePrimaryMedium("Unknown"), null);
});