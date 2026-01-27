import { db } from "./db";
import { gridSegments, type GridSegment, type InsertGridSegment } from "@shared/schema";
import { eq, asc } from "drizzle-orm";

export interface IStorage {
  getGridSegments(): Promise<GridSegment[]>;
  getGridSegment(id: number): Promise<GridSegment | undefined>;
  updateGridSegment(id: number, segment: Partial<InsertGridSegment>): Promise<GridSegment>;
  initializeGrid(segments: InsertGridSegment[]): Promise<void>;
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
}

export const storage = new DatabaseStorage();
