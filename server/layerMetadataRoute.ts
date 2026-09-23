import type { Express } from "express";
import { z } from "zod";
import type { Layer } from "@shared/schema";
import { PRIMARY_MEDIA } from "@shared/mediaTaxonomy";

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
  primaryMedium: z.enum(PRIMARY_MEDIA).optional(),
  additionalMedia: z.array(z.enum(PRIMARY_MEDIA))
    .max(PRIMARY_MEDIA.length - 1)
    .refine(values => new Set(values).size === values.length, "Additional media must be unique")
    .optional(),
  gender: z.enum(["Male", "Female"]).optional(),
  isAfricanAmerican: z.boolean().optional(),
});

export type LayerMetadataUpdate = z.infer<typeof layerMetadataSchema>;

export type LayerMetadataStorage = {
  getLayer(id: number): Promise<Layer | undefined>;
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
      const current = await layerStorage.getLayer(id);
      if (!current) return res.status(404).json({ message: "Layer not found" });
      if ((body.additionalMedia ?? current.additionalMedia).includes(body.primaryMedium ?? current.primaryMedium ?? "")) {
        return res.status(400).json({ message: "Primary medium cannot also be additional" });
      }
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
        additionalMedia: updated.additionalMedia,
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