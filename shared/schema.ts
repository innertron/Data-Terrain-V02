import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const projectSettings = pgTable("project_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const gridSegments = pgTable("grid_segments", {
  id: serial("id").primaryKey(),
  xIndex: integer("x_index").notNull(), // 0-24
  zIndex: integer("z_index").notNull(), // 0-24
  xLabel: text("x_label").notNull(),    // Political Domain
  zLabel: text("z_label").notNull(),    // Income/Educational Level
  value: integer("value").notNull(),    // Y-axis: Amount of people
  description: text("description"),      // Optional details
});

export const insertGridSegmentSchema = createInsertSchema(gridSegments).omit({ id: true });

export type GridSegment = typeof gridSegments.$inferSelect;
export type InsertGridSegment = z.infer<typeof insertGridSegmentSchema>;
