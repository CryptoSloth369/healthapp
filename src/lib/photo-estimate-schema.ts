/**
 * Schema and helpers for the photo calorie estimator. No I/O here so it can be
 * unit-tested and shared with the client.
 */
import { z } from "zod";

export const EstimatedItemSchema = z.object({
  name: z.string().describe("Short food name, e.g. 'Grilled chicken breast'"),
  portion: z.string().describe("Estimated portion in everyday US units, e.g. '6 oz', '1 cup', '2 slices'"),
  grams: z.number().describe("Estimated weight of this portion in grams"),
  kcal: z.number().describe("Calories for the whole estimated portion"),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  confidence: z.enum(["low", "medium", "high"]).describe("How sure you are about the identification AND the portion size"),
});

export const PhotoEstimateSchema = z.object({
  is_food: z.boolean().describe("False if the photo does not show food or drink"),
  items: z.array(EstimatedItemSchema).describe("One entry per distinct food or drink, including visible sauces, dressings and cooking oil"),
  notes: z.string().describe("One or two short sentences on assumptions or what would change the estimate; empty if nothing notable"),
});

export type EstimatedItem = z.infer<typeof EstimatedItemSchema>;
export type PhotoEstimate = z.infer<typeof PhotoEstimateSchema>;

export const CONFIDENCE_SCORE: Record<EstimatedItem["confidence"], number> = {
  low: 0.4,
  medium: 0.7,
  high: 0.9,
};

/** Clean up model output: round, clamp negatives, drop empty rows. */
export function normalizeEstimate(e: PhotoEstimate): PhotoEstimate {
  const r1 = (v: number) => Math.max(0, Math.round(v * 10) / 10);
  return {
    is_food: e.is_food,
    notes: e.notes.trim(),
    items: e.items
      .filter((i) => i.name.trim() && Number.isFinite(i.kcal))
      .map((i) => ({
        ...i,
        name: i.name.trim().slice(0, 120),
        portion: i.portion.trim().slice(0, 60),
        grams: Math.max(0, Math.round(i.grams)),
        kcal: Math.max(0, Math.round(i.kcal)),
        protein_g: r1(i.protein_g),
        carbs_g: r1(i.carbs_g),
        fat_g: r1(i.fat_g),
      })),
  };
}
