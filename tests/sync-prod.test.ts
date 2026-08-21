import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error The production sync is an executable JavaScript module.
import { syncProduction } from "../scripts/sync-prod.js";

const DEV_LAYERS_URL = "http://localhost:5000/api/layers";
const PROD_LAYERS_URL = "https://data-terrain-v-02.replit.app/api/layers";
const PROD_LAYER_PATCH_URL =
  /^https:\/\/data-terrain-v-02\.replit\.app\/api\/layers\/(\d+)\/rename$/;
const MEDIUM_SYNC_FIELDS = new Set(["affiliation", "primaryMedium"]);
const PROTECTED_FIELD_MUTATIONS: Partial<Layer> = {
  id: 2,
  name: "Mutated Layer",
  name2: "Mutated secondary title",
  description: "Mutated description",
  icon: "mutated-icon",
  color: "#ff0000",
  gridValues: [[999]],
  active: false,
  params: { amplitude: 99 },
  rank: 99,
  gender: "Female",
  isAfricanAmerican: true,
};

type Layer = {
  id: number;
  name: string;
  name2: string | null;
  description: string | null;
  icon: string | null;
  color: string;
  gridValues: number[][];
  active: boolean;
  params: Record<string, unknown> | null;
  rank: number | null;
  affiliation: string;
  primaryMedium: string;
  gender: string | null;
  isAfricanAmerican: boolean;
};

type RequestRecord = {
  url: string;
  method: string;
  body?: Record<string, unknown>;
};

function layer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: 1,
    name: "Test Layer",
    name2: "Secondary title",
    description: "Layer description",
    icon: "newspaper",
    color: "#a8d4d2",
    gridValues: [[1, 2], [3, 4]],
    active: true,
    params: { amplitude: 2 },
    rank: 7,
    affiliation: "Independent",
    primaryMedium: "Cable TV",
    gender: "Male",
    isAfricanAmerican: false,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installMockApi({
  devLayers,
  prodLayers,
  afterPatch,
}: {
  devLayers: Layer[];
  prodLayers: Layer[];
  afterPatch?: (layers: Layer[], body: Record<string, unknown>) => void;
}) {
  const originalFetch = globalThis.fetch;
  const productionLayers = structuredClone(prodLayers);
  const requests: RequestRecord[] = [];

  globalThis.fetch = (async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";

    if (url === DEV_LAYERS_URL && method === "GET") {
      requests.push({ url, method });
      return jsonResponse(structuredClone(devLayers));
    }

    if (url === PROD_LAYERS_URL && method === "GET") {
      requests.push({ url, method });
      return jsonResponse(structuredClone(productionLayers));
    }

    const patchMatch = url.match(PROD_LAYER_PATCH_URL);
    if (patchMatch && method === "PATCH") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      requests.push({ url, method, body });
      const productionLayer = productionLayers.find(
        current => current.id === Number(patchMatch[1]),
      );
      assert(productionLayer, `Unknown production layer id ${patchMatch[1]}`);
      Object.assign(productionLayer, body);
      afterPatch?.(productionLayers, body);
      return jsonResponse(structuredClone(productionLayer));
    }

    throw new Error(`Unexpected network request: ${method} ${url}`);
  }) as typeof fetch;

  return {
    requests,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

test("medium-only sync makes no PATCH request when metadata already matches", async () => {
  const devLayers = [layer()];
  const api = installMockApi({ devLayers, prodLayers: [layer()] });

  try {
    await syncProduction({ mediumOnly: true });

    assert.deepEqual(
      api.requests.map(({ url, method }) => ({ url, method })),
      [
        { url: DEV_LAYERS_URL, method: "GET" },
        { url: PROD_LAYERS_URL, method: "GET" },
        { url: PROD_LAYERS_URL, method: "GET" },
      ],
    );
  } finally {
    api.restore();
  }
});

test("medium-only sync PATCHes only changed affiliation and primaryMedium", async () => {
  const devLayers = [
    layer({ affiliation: "Conservative", primaryMedium: "Podcast" }),
  ];
  const api = installMockApi({
    devLayers,
    prodLayers: [layer({ affiliation: "Independent", primaryMedium: "Cable TV" })],
  });

  try {
    await syncProduction({ mediumOnly: true });

    const patches = api.requests.filter(request => request.method === "PATCH");
    assert.equal(patches.length, 1);
    assert.deepEqual(patches[0].body, {
      affiliation: "Conservative",
      primaryMedium: "Podcast",
    });
    for (const patch of patches) {
      for (const field of Object.keys(patch.body ?? {})) {
        assert(
          MEDIUM_SYNC_FIELDS.has(field),
          `PATCH body includes protected field "${field}"`,
        );
      }
    }
  } finally {
    api.restore();
  }
});

test("medium-only sync rejects invalid development primary media before PATCHing", async () => {
  const api = installMockApi({
    devLayers: [layer({ primaryMedium: "Podcast / YouTube" })],
    prodLayers: [layer({ primaryMedium: "Podcast / YouTube" })],
  });

  try {
    await assert.rejects(
      () => syncProduction({ mediumOnly: true }),
      /Development contains invalid primary media: Test Layer \(Podcast \/ YouTube\)/,
    );
    assert.equal(
      api.requests.filter(request => request.method === "PATCH").length,
      0,
    );
  } finally {
    api.restore();
  }
});

test("medium-only sync rejects development and production layer-name mismatches", async () => {
  const api = installMockApi({
    devLayers: [layer({ name: "Development Layer" })],
    prodLayers: [layer({ name: "Production Layer" })],
  });

  try {
    await assert.rejects(
      () => syncProduction({ mediumOnly: true }),
      /Layer names differ\. Missing in production: Development Layer\. Only in production: Production Layer\./,
    );
    assert.equal(
      api.requests.filter(request => request.method === "PATCH").length,
      0,
    );
  } finally {
    api.restore();
  }
});

test("medium-only sync rejects every protected production-field mutation", async () => {
  for (const [field, mutatedValue] of Object.entries(PROTECTED_FIELD_MUTATIONS)) {
    const api = installMockApi({
      devLayers: [layer({ affiliation: "Conservative" })],
      prodLayers: [layer()],
      afterPatch(layers) {
        Object.assign(layers[0], { [field]: mutatedValue });
      },
    });

    try {
      await assert.rejects(
        () => syncProduction({ mediumOnly: true }),
        undefined,
        `Expected a post-sync failure when production mutated protected field "${field}"`,
      );
    } finally {
      api.restore();
    }
  }
});