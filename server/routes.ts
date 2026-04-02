import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { initializeSegmentTables, getSegmentData, setSegmentData, getSegmentTotal } from "./segmentDb";

const segmentDataRowSchema = z.object({
  response_category: z.string().min(1),
  count: z.number().int().min(0),
});

const uploadDataSchema = z.object({
  rows: z.array(segmentDataRowSchema).min(1),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Initialize all 625 segment data tables
  await initializeSegmentTables();

  // Seeding logic
  const existingSegments = await storage.getGridSegments();
  if (existingSegments.length === 0) {
    console.log("Seeding DemoScape grid...");
    const segments = [];
    const gridSize = 25;

    const getXLabel = (i: number) => {
      if (i < 4) return "Far Left";
      if (i < 8) return "Left";
      if (i < 11) return "Center-Left";
      if (i === 12) return "Center";
      if (i < 16) return "Center-Right";
      if (i < 20) return "Right";
      return "Far Right";
    };

    const getZLabel = (i: number) => {
      if (i < 5) return "Low Income/Edu";
      if (i < 10) return "Working Class";
      if (i < 15) return "Middle Class";
      if (i < 20) return "Upper Middle";
      return "High Income/Elite";
    };

    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        const dx = x - 12;
        const dz = z - 12;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const baseValue = Math.max(10, 100 * Math.exp(-(dist * dist) / 50)); 
        const randomValue = Math.floor(Math.random() * 20);
        
        segments.push({
          xIndex: x,
          zIndex: z,
          xLabel: getXLabel(x),
          zLabel: getZLabel(z),
          value: Math.floor(baseValue + randomValue),
          description: `Segment [${x},${z}]`,
        });
      }
    }
    await storage.initializeGrid(segments);
    console.log("DemoScape grid seeded!");
  }

  // GET all segments (for the landscape)
  app.get(api.segments.list.path, async (req, res) => {
    const segments = await storage.getGridSegments();
    res.json(segments);
  });

  // PUT update a segment's value manually
  app.put(api.segments.update.path, async (req, res) => {
    try {
      const input = api.segments.update.input.parse(req.body);
      const updated = await storage.updateGridSegment(Number(req.params.id), input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET data rows for a specific segment's dedicated table
  app.get("/api/segments/:id/data", async (req, res) => {
    try {
      const segmentId = Number(req.params.id);
      if (isNaN(segmentId) || segmentId < 1 || segmentId > 625) {
        return res.status(400).json({ message: "Invalid segment ID (must be 1–625)" });
      }
      const rows = await getSegmentData(segmentId);
      const total = rows.reduce((sum, r) => sum + r.count, 0);
      res.json({ segmentId, rows, total });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch segment data" });
    }
  });

  // POST upload CSV data (as JSON rows) to a segment's dedicated table
  app.post("/api/segments/:id/data", async (req, res) => {
    try {
      const segmentId = Number(req.params.id);
      if (isNaN(segmentId) || segmentId < 1 || segmentId > 625) {
        return res.status(400).json({ message: "Invalid segment ID (must be 1–625)" });
      }
      const { rows } = uploadDataSchema.parse(req.body);
      const total = await setSegmentData(segmentId, rows);
      // Update the grid_segments.value so bar height reflects the new data
      await storage.updateGridSegment(segmentId, { value: total });
      res.json({ segmentId, total, rowCount: rows.length });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error(err);
      res.status(500).json({ message: "Failed to upload segment data" });
    }
  });

  return httpServer;
}
