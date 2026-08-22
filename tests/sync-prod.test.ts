import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error The production sync is an executable JavaScript module.
import { syncProduction } from "../scripts/sync-prod.js";

const DEV_LAYERS_URL = "http://localhost:5000/api/layers";
const PROD_LAYERS_URL = "https://data-terrain-v-02.replit.app/api/layers";
const PROD_LAYER_PATCH_URL =
  /^https:\/\/data-terrain-v-02\.replit\.app\/api\/layers\/(\d+)\/rename$/;
const PROD_LAYER_DELETE_URL =
  /^https:\/\/data-terrain-v-02\.replit\.app\/api\/layers\/(\d+)$/;
const DEV_SETTINGS_URL = "http://localhost:5000/api/settings";
const PROD_SETTINGS_GET_URL = "https://data-terrain-v-02.replit.app/api/settings";
const PROD_SETTINGS_URL =
  /^https:\/\/data-terrain-v-02\.replit\.app\/api\/settings\/(axis_x|axis_z)$/;
const MEDIUM_SYNC_FIELDS = new Set(["affiliation", "primaryMedium"]);
const PROTECTED_FIELD_MUTATIONS: Partial<Layer> = {
  id: 2,
  name: "Mutated Layer",
  name2: "Mutated secondary title",
  description: "Mutated description",
  icon: "mutated-icon",
  color: "#ff0000",
  gridValues: [[999]],
  originalGridValues: [[888]],
  active: false,
  params: '{"amplitude":99}',
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
  originalGridValues: number[][];
  active: boolean;
  params: string | null;
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
    originalGridValues: [[1, 2], [3, 4]],
    active: true,
    params: '{"amplitude":2}',
    rank: 7,
    affiliation: "Independent",
    primaryMedium: "Cable TV",
    gender: "Male",
    isAfricanAmerican: false,
    ...overrides,
  };
}

function fullGrid(total: number): number[][] {
  return Array.from({ length: 25 }, (_, row) =>
    Array.from({ length: 25 }, (_, col) => row === 0 && col === 0 ? total : 0),
  );
}

function parseCsvGrid(csv: string): number[][] {
  return csv.trim().split("\n").slice(1).map(row => row.split(",").map(Number));
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

function installFullMockApi({
  devLayers,
  prodLayers,
  failCreateName,
  prodSettings = { axis_x: "x-axis", axis_z: "z-axis" },
  failSettingsPutCount = 0,
  failDeleteId,
  failDeleteCount = 0,
}: {
  devLayers: Layer[];
  prodLayers: Layer[];
  failCreateName?: string;
  prodSettings?: Record<string, string>;
  failSettingsPutCount?: number;
  failDeleteId?: number;
  failDeleteCount?: number;
}) {
  const originalFetch = globalThis.fetch;
  const productionLayers = structuredClone(prodLayers);
  const productionSettings = structuredClone(prodSettings);
  const requests: RequestRecord[] = [];
  let nextId = 1000;
  let remainingSettingsFailures = failSettingsPutCount;
  let remainingDeleteFailures = failDeleteCount;

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
    if (url === DEV_SETTINGS_URL && method === "GET") {
      requests.push({ url, method });
      return jsonResponse({ axis_x: "x-axis", axis_z: "z-axis" });
    }
    if (url === PROD_SETTINGS_GET_URL && method === "GET") {
      requests.push({ url, method });
      return jsonResponse(structuredClone(productionSettings));
    }
    if (url === PROD_LAYERS_URL && method === "POST") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      requests.push({ url, method, body });
      if (body.name === failCreateName) {
        return jsonResponse({ message: "simulated create failure" }, 500);
      }
      const created: Layer = {
        id: nextId++,
        name: String(body.name),
        name2: typeof body.name2 === "string" ? body.name2 : null,
        description: typeof body.description === "string" ? body.description : null,
        icon: typeof body.icon === "string" ? body.icon : null,
        color: String(body.color),
        gridValues: parseCsvGrid(String(body.csv)),
        originalGridValues: parseCsvGrid(String(body.originalCsv)),
        active: Boolean(body.active),
        params: typeof body.params === "string" ? body.params : null,
        rank: typeof body.rank === "number" ? body.rank : null,
        affiliation: String(body.affiliation),
        primaryMedium: String(body.primaryMedium),
        gender: typeof body.gender === "string" ? body.gender : null,
        isAfricanAmerican: body.isAfricanAmerican === true,
      };
      productionLayers.push(created);
      return jsonResponse(structuredClone(created), 201);
    }

    const deleteMatch = url.match(PROD_LAYER_DELETE_URL);
    if (deleteMatch && method === "DELETE") {
      requests.push({ url, method });
      const id = Number(deleteMatch[1]);
      if (id === failDeleteId && remainingDeleteFailures > 0) {
        remainingDeleteFailures--;
        return jsonResponse({ message: "simulated delete failure" }, 500);
      }
      const index = productionLayers.findIndex(layer => layer.id === id);
      if (index < 0) return jsonResponse({ message: "missing" }, 404);
      productionLayers.splice(index, 1);
      return jsonResponse({ ok: true });
    }

    if (PROD_SETTINGS_URL.test(url) && method === "PUT") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      requests.push({ url, method, body });
      if (remainingSettingsFailures > 0) {
        remainingSettingsFailures--;
        return jsonResponse({ message: "simulated settings failure" }, 500);
      }
      const key = url.split("/").at(-1)!;
      productionSettings[key] = String(body.value);
      return jsonResponse({ ok: true });
    }

    throw new Error(`Unexpected network request: ${method} ${url}`);
  }) as typeof fetch;

  return {
    productionLayers,
    productionSettings,
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

test("full sync stages exact inactive and parameterized layers before deleting old rows", async () => {
  const originalGrid = fullGrid(10.123456);
  const workingGrid = fullGrid(9.5);
  const devLayer = layer({
    gridValues: workingGrid,
    originalGridValues: originalGrid,
    active: false,
    params: '{"shape":"circle","amplitude":2}',
  });
  const prodLayer = layer({
    id: 50,
    gridValues: fullGrid(8),
    originalGridValues: fullGrid(8),
    active: true,
    params: null,
  });
  const api = installFullMockApi({
    devLayers: [devLayer],
    prodLayers: [prodLayer],
  });

  try {
    await syncProduction({
      mediumOnly: false,
      traceTotals: new Map([["Test Layer", 10.123456]]),
    });

    assert.equal(api.productionLayers.length, 1);
    assert.deepEqual(
      api.productionLayers[0],
      { ...devLayer, id: api.productionLayers[0].id },
    );
    const createIndex = api.requests.findIndex(request => request.method === "POST");
    const oldDeleteIndex = api.requests.findIndex(
      request => request.method === "DELETE" && request.url.endsWith("/50"),
    );
    assert(createIndex >= 0 && oldDeleteIndex > createIndex);
    const create = api.requests[createIndex];
    assert.equal(create.body?.active, false);
    assert.equal(create.body?.params, '{"shape":"circle","amplitude":2}');
    assert.deepEqual(parseCsvGrid(String(create.body?.csv)), workingGrid);
    assert.deepEqual(parseCsvGrid(String(create.body?.originalCsv)), originalGrid);
  } finally {
    api.restore();
  }
});

test("full sync aborts before writes when an immutable grid misses its trace total", async () => {
  const devLayer = layer({
    gridValues: fullGrid(10),
    originalGridValues: fullGrid(10),
  });
  const api = installFullMockApi({
    devLayers: [devLayer],
    prodLayers: [{ ...devLayer, id: 50, active: false }],
  });

  try {
    await assert.rejects(
      () => syncProduction({
        mediumOnly: false,
        traceTotals: new Map([["Test Layer", 10.5]]),
      }),
      /original grid total 10 does not match trace total 10.5/,
    );
    assert.equal(
      api.requests.filter(request =>
        ["POST", "PUT", "PATCH", "DELETE"].includes(request.method),
      ).length,
      0,
    );
  } finally {
    api.restore();
  }
});

test("full sync cleans staged rows and keeps old rows when staging fails", async () => {
  const first = layer({
    name: "First Layer",
    gridValues: fullGrid(4),
    originalGridValues: fullGrid(4),
  });
  const second = layer({
    id: 2,
    name: "Second Layer",
    primaryMedium: "Print",
    gridValues: fullGrid(6),
    originalGridValues: fullGrid(6),
  });
  const oldFirst = { ...first, id: 50, active: false };
  const oldSecond = { ...second, id: 60, active: false };
  const api = installFullMockApi({
    devLayers: [first, second],
    prodLayers: [oldFirst, oldSecond],
    failCreateName: "Second Layer",
  });

  try {
    await assert.rejects(
      () => syncProduction({
        mediumOnly: false,
        traceTotals: new Map([
          ["First Layer", 4],
          ["Second Layer", 6],
        ]),
      }),
      /Create staged layer "Second Layer" -> 500/,
    );
    assert.deepEqual(
      api.productionLayers.map(layer => layer.id).sort((a, b) => a - b),
      [50, 60],
    );
    const deletedIds = api.requests
      .filter(request => request.method === "DELETE")
      .map(request => Number(request.url.split("/").at(-1)));
    assert.deepEqual(deletedIds, [1000]);
  } finally {
    api.restore();
  }
});

test("full sync reconciles axis-only drift without replacing matching layers", async () => {
  const exactLayer = layer({
    gridValues: fullGrid(9),
    originalGridValues: fullGrid(10),
  });
  const api = installFullMockApi({
    devLayers: [exactLayer],
    prodLayers: [structuredClone(exactLayer)],
    prodSettings: { axis_x: "old-x-axis", axis_z: "z-axis" },
  });

  try {
    await syncProduction({
      mediumOnly: false,
      traceTotals: new Map([["Test Layer", 10]]),
    });

    assert.deepEqual(api.productionSettings, {
      axis_x: "x-axis",
      axis_z: "z-axis",
    });
    assert.equal(
      api.requests.filter(request =>
        ["POST", "DELETE"].includes(request.method),
      ).length,
      0,
    );
    assert.equal(
      api.requests.filter(request => request.method === "PUT").length,
      1,
    );
  } finally {
    api.restore();
  }
});

test("full sync retries stale axis settings after an earlier PUT failure", async () => {
  const exactLayer = layer({
    gridValues: fullGrid(9),
    originalGridValues: fullGrid(10),
  });
  const api = installFullMockApi({
    devLayers: [exactLayer],
    prodLayers: [structuredClone(exactLayer)],
    prodSettings: { axis_x: "old-x-axis", axis_z: "z-axis" },
    failSettingsPutCount: 1,
  });
  const options = {
    mediumOnly: false,
    traceTotals: new Map([["Test Layer", 10]]),
  };

  try {
    await assert.rejects(
      () => syncProduction(options),
      /Sync axis_x -> 500/,
    );
    await syncProduction(options);

    assert.equal(api.productionSettings.axis_x, "x-axis");
    assert.equal(
      api.requests.filter(request => request.method === "PUT").length,
      2,
    );
    assert.equal(
      api.requests.filter(request =>
        ["POST", "DELETE"].includes(request.method),
      ).length,
      0,
    );
  } finally {
    api.restore();
  }
});

test("full sync resumes after an old-row delete failure and reaches exact parity", async () => {
  const first = layer({
    name: "First Layer",
    gridValues: fullGrid(4),
    originalGridValues: fullGrid(4),
  });
  const second = layer({
    id: 2,
    name: "Second Layer",
    primaryMedium: "Print",
    gridValues: fullGrid(6),
    originalGridValues: fullGrid(6),
  });
  const api = installFullMockApi({
    devLayers: [first, second],
    prodLayers: [
      { ...first, id: 50, active: false },
      { ...second, id: 60, active: false },
    ],
    failDeleteId: 60,
    failDeleteCount: 1,
  });
  const options = {
    mediumOnly: false,
    traceTotals: new Map([
      ["First Layer", 4],
      ["Second Layer", 6],
    ]),
  };

  try {
    await assert.rejects(
      () => syncProduction(options),
      /Delete old production layer failed for "Second Layer" \(id 60\) -> 500/,
    );
    assert.deepEqual(
      api.productionLayers.map(layer => layer.id).sort((a, b) => a - b),
      [60, 1000, 1001],
    );

    await syncProduction(options);

    assert.equal(api.productionLayers.length, 2);
    assert.deepEqual(
      api.productionLayers.map(({ id: _id, ...rest }) => rest),
      [
        (({ id: _id, ...rest }) => rest)(first),
        (({ id: _id, ...rest }) => rest)(second),
      ],
    );
    assert.equal(
      api.requests.filter(request => request.method === "POST").length,
      2,
      "retry should reuse the already staged replacement set",
    );
  } finally {
    api.restore();
  }
});