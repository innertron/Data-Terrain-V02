import { db } from "./db";
import { gridSegments, projectSettings, layers, type GridSegment, type InsertGridSegment, type Layer, type InsertLayer } from "@shared/schema";
import { eq, asc } from "drizzle-orm";

export interface IStorage {
  getGridSegments(): Promise<GridSegment[]>;
  getGridSegment(id: number): Promise<GridSegment | undefined>;
  updateGridSegment(id: number, segment: Partial<InsertGridSegment>): Promise<GridSegment>;
  initializeGrid(segments: InsertGridSegment[]): Promise<void>;
  getAllSettings(): Promise<Record<string, string>>;
  setSetting(key: string, value: string): Promise<void>;
  // Layers
  getLayers(): Promise<Layer[]>;
  getLayer(id: number): Promise<Layer | undefined>;
  createLayer(layer: InsertLayer): Promise<Layer>;
  updateLayerActive(id: number, active: boolean): Promise<Layer>;
  updateLayerGridValues(id: number, gridValues: string, params?: string): Promise<Layer>;
  deleteLayer(id: number): Promise<void>;
  layerCount(): Promise<number>;
  bulkInsertLayers(layerList: InsertLayer[]): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getGridSegments(): Promise<GridSegment[]> {
    return await db.select().from(gridSegments).orderBy(asc(gridSegments.xIndex), asc(gridSegments.zIndex));
  }

  async getGridSegment(id: number): Promise<GridSegment | undefined> {
    const [segment] = await db.select().from(gridSegments).where(eq(gridSegments.id, id));
    return segment;
  }

  async updateGridSegment(id: number, updates: Partial<InsertGridSegment>): Promise<GridSegment> {
    const [updated] = await db.update(gridSegments)
      .set(updates)
      .where(eq(gridSegments.id, id))
      .returning();
    return updated;
  }

  async initializeGrid(segments: InsertGridSegment[]): Promise<void> {
    await db.insert(gridSegments).values(segments);
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const rows = await db.select().from(projectSettings);
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  async setSetting(key: string, value: string): Promise<void> {
    await db.insert(projectSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: projectSettings.key, set: { value } });
  }

  // --- Layers ---

  async getLayers(): Promise<Layer[]> {
    return await db.select().from(layers).orderBy(asc(layers.id));
  }

  async getLayer(id: number): Promise<Layer | undefined> {
    const [row] = await db.select().from(layers).where(eq(layers.id, id));
    return row;
  }

  async createLayer(layer: InsertLayer): Promise<Layer> {
    const [created] = await db.insert(layers).values(layer).returning();
    return created;
  }

  async updateLayerName(id: number, name: string): Promise<Layer> {
    const [updated] = await db.update(layers)
      .set({ name })
      .where(eq(layers.id, id))
      .returning();
    return updated;
  }

  async updateLayerActive(id: number, active: boolean): Promise<Layer> {
    const [updated] = await db.update(layers)
      .set({ active })
      .where(eq(layers.id, id))
      .returning();
    return updated;
  }

  async updateLayerGridValues(id: number, gridValues: string, params?: string): Promise<Layer> {
    const [updated] = await db.update(layers)
      .set({ gridValues, ...(params !== undefined ? { params } : {}) })
      .where(eq(layers.id, id))
      .returning();
    return updated;
  }

  async deleteLayer(id: number): Promise<void> {
    await db.delete(layers).where(eq(layers.id, id));
  }

  async layerCount(): Promise<number> {
    const rows = await db.select().from(layers);
    return rows.length;
  }

  async bulkInsertLayers(layerList: InsertLayer[]): Promise<void> {
    await db.insert(layers).values(layerList);
  }
}

export const storage = new DatabaseStorage();
