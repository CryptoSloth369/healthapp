import { describe, expect, it } from "vitest";
import { normalizeEstimate, PhotoEstimateSchema } from "./photo-estimate-schema";

describe("normalizeEstimate", () => {
  it("rounds, clamps and drops empty rows", () => {
    const out = normalizeEstimate({
      is_food: true,
      notes: "  Assumed olive oil.  ",
      items: [
        { name: " Salmon ", portion: "6 oz", grams: 170.4, kcal: 350.6, protein_g: 34.44, carbs_g: -1, fat_g: 22.06, confidence: "high" },
        { name: "  ", portion: "", grams: 0, kcal: 10, protein_g: 0, carbs_g: 0, fat_g: 0, confidence: "low" },
      ],
    });
    expect(out.notes).toBe("Assumed olive oil.");
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ name: "Salmon", grams: 170, kcal: 351, protein_g: 34.4, carbs_g: 0, fat_g: 22.1 });
  });

  it("schema rejects malformed output", () => {
    expect(PhotoEstimateSchema.safeParse({ is_food: true, items: [{ name: "x" }], notes: "" }).success).toBe(false);
  });
});
