import { z } from "zod";
import { PRIMARY_MEDIA } from "@shared/mediaTaxonomy";

const imageDataUrlSchema = z.string().refine(
  value =>
    value.startsWith("data:image/jpeg;base64,") ||
    value.startsWith("data:image/png;base64,"),
  { message: "Icon must be a JPG or PNG data URL" },
);

export const newLayerSchema = z.object({
  name: z.string().min(1),
  name2: z.string().max(20).optional(),
  description: z.string().max(200).optional(),
  icon: imageDataUrlSchema.optional(),
  color: z.string().min(1),
  csv: z.string().min(1),
  originalCsv: z.string().min(1).optional(),
  active: z.boolean().optional(),
  params: z.string().refine(value => {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }, { message: "Params must be valid JSON" }).nullable().optional(),
  rank: z.number().int().min(1).max(200).optional(),
  affiliation: z.string().max(50).optional(),
  primaryMedium: z.enum(PRIMARY_MEDIA).optional(),
  gender: z.enum(["Male", "Female"]).optional(),
  isAfricanAmerican: z.boolean().optional(),
});