import { describe, expect, it } from "vitest";
import { kcalFromMacros, mealForHour, perServing, scaleNutrients, servingText, sumNutrients } from "./nutrition";

describe("sumNutrients", () => {
  it("adds and treats missing macros as zero", () => {
    expect(
      sumNutrients([
        { kcal: 300, protein_g: 20, carbs_g: 30, fat_g: 10 },
        { kcal: 150.4, protein_g: null, carbs_g: 12.5, fat_g: null },
      ]),
    ).toEqual({ kcal: 450, protein: 20, carbs: 43, fat: 10 });
  });
});

describe("scaleNutrients / perServing", () => {
  it("round-trips", () => {
    const per = { kcal: 210, protein_g: 7.5, carbs_g: 30, fat_g: null };
    const total = scaleNutrients(per, 1.5);
    expect(total).toEqual({ kcal: 315, protein_g: 11.3, carbs_g: 45, fat_g: null });
    expect(perServing(total, 1.5)).toEqual({ kcal: 210, protein_g: 7.5, carbs_g: 30, fat_g: null });
  });
});

describe("mealForHour", () => {
  it("maps hours to meals", () => {
    expect(mealForHour(7)).toBe("breakfast");
    expect(mealForHour(12)).toBe("lunch");
    expect(mealForHour(16)).toBe("snack");
    expect(mealForHour(19)).toBe("dinner");
    expect(mealForHour(23)).toBe("snack");
  });
});

describe("misc", () => {
  it("kcal from macros", () => expect(kcalFromMacros(30, 40, 10)).toBe(370));
  it("serving text", () => {
    expect(servingText(1, "1 cup")).toBe("1 cup");
    expect(servingText(1.5, "1 cup")).toBe("1.5 × 1 cup");
    expect(servingText(2, null)).toBe("2 servings");
    expect(servingText(1, null)).toBe("");
  });
});
