import type { Express } from "express";
import { z } from "zod";
import type { Layer } from "@shared/schema";

export const layerMetadataSchema = z.object({
  name: z.string().min(1).optional(),
  name2: z.string().max(20).optional(),
  description: z.string().max(200).optional(),
  icon: z
    .string()
    .refine(
      value =>
        value.startsWith("data:image/jpeg;base64,") ||
        value.startsWith("data:image/png;base64,"),
      { message: "Icon must be a JPG or PNG data URL" },
    )
    .optional(),
  rank: z.number().int().min(1).max(200).optional(),
  affiliation: z.string().max(50).optional(),
  primaryMedium: z.string().max(50).optional(),
  gender: z.enum(["Male", "Female"]).optional(),
  isAfricanAmerican: z.boolean().optional(),
});

export type LayerMetadataUpdate = z.infer<typeof layerMetadataSchema>;

export type LayerMetadataStorage = {
  updateLayerMeta(id: number, fields: LayerMetadataUpdate): Promise<Layer>;
};

export function registerLayerMetadataRoute(
  app: Express,
  layerStorage: LayerMetadataStorage,
): void {
  app.patch("/api/layers/:id/rename", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const body = layerMetadataSchema.parse(req.body);
      const updated = await layerStorage.updateLayerMeta(id, body);
      res.json({
        id: updated.id,
        name: updated.name,
        name2: updated.name2,
        description: updated.description,
        icon: updated.icon,
        rank: updated.rank,
        affiliation: updated.affiliation,
        primaryMedium: updated.primaryMedium,
        gender: updated.gender,
        isAfricanAmerican: updated.isAfricanAmerican,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error(err);
      res.status(500).json({ message: "Failed to update layer" });
    }
  });
}