import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import type { Layer } from "../shared/schema.ts";
import {
  registerLayerMetadataRoute,
  type LayerMetadataStorage,
  type LayerMetadataUpdate,
} from "../server/layerMetadataRoute.ts";
import { PRIMARY_MEDIA } from "../shared/mediaTaxonomy.ts";

function makeLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: 7,
    name: "Test Layer",
    name2: null,
    description: null,
    icon: null,
    color: "#000000",
    gridValues: "[[1]]",
    originalGridValues: "[[1]]",
    active: true,
    params: null,
    rank: null,
    affiliation: null,
    gender: null,
    isAfricanAmerican: false,
    primaryMedium: null,
    ...overrides,
  };
}

test("the metadata API saves demographic metadata and canonical primary media", async () => {
  let storedLayer = makeLayer();
  const updates: LayerMetadataUpdate[] = [];
  const storage: LayerMetadataStorage = {
    async updateLayerMeta(id, fields) {
      assert.equal(id, storedLayer.id);
      updates.push(fields);
      storedLayer = { ...storedLayer, ...fields };
      return storedLayer;
    },
  };

  const app = express();
  app.use(express.json());
  registerLayerMetadataRoute(app, storage);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const endpoint = `http://127.0.0.1:${address.port}/api/layers/7/rename`;

    const savedResponse = await fetch(endpoint, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isAfricanAmerican: true }),
    });
    assert.equal(savedResponse.status, 200);
    const saved = (await savedResponse.json()) as {
      isAfricanAmerican: boolean;
    };
    assert.equal(saved.isAfricanAmerican, true);
    assert.deepEqual(updates[0], { isAfricanAmerican: true });

    const clearedResponse = await fetch(endpoint, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isAfricanAmerican: false }),
    });
    assert.equal(clearedResponse.status, 200);
    const cleared = (await clearedResponse.json()) as {
      isAfricanAmerican: boolean;
    };
    assert.equal(cleared.isAfricanAmerican, false);
    assert.deepEqual(updates[1], { isAfricanAmerican: false });

    for (const primaryMedium of PRIMARY_MEDIA) {
      const mediumResponse = await fetch(endpoint, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ primaryMedium }),
      });
      assert.equal(mediumResponse.status, 200);
      const savedMedium = (await mediumResponse.json()) as {
        primaryMedium: string;
      };
      assert.equal(savedMedium.primaryMedium, primaryMedium);
      assert.deepEqual(updates.at(-1), { primaryMedium });
    }

    const updateCount = updates.length;
    const legacyMediumResponse = await fetch(endpoint, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ primaryMedium: "Podcast / YouTube" }),
    });
    assert.equal(legacyMediumResponse.status, 400);
    assert.equal(updates.length, updateCount);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    );
  }
});