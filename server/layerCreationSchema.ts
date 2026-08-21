import { z } from "zod";
import { PRIMARY_MEDIA } from "@shared/mediaTaxonomy";

export const newLayerSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
  csv: z.string().min(1),
  rank: z.number().int().min(1).max(200).optional(),
  affiliation: z.string().optional(),
  primaryMedium: z.enum(PRIMARY_MEDIA).optional(),
  gender: z.enum(["Male", "Female"]).optional(),
  isAfricanAmerican: z.boolean().optional(),
});