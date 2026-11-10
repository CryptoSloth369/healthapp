import { describe, expect, it } from "vitest";
import { normalizeBarcode, parseOffProduct, parseUsdaSearch, toDraft } from "./food-db";

describe("USDA search", () => {
  const json = {
    foods: [
      {
        fdcId: 171705,
        description: "BANANAS, RAW",
        dataType: "SR Legacy",
        foodNutrients: [
          { nutrientId: 1008, nutrientNumber: "208", nutrientName: "Energy", unitName: "KCAL", value: 89 },
          { nutrientId: 1003, nutrientNumber: "203", nutrientName: "Protein", unitName: "G", value: 1.09 },
          { nutrientId: 1005, nutrientNumber: "205", nutrientName: "Carbohydrate, by difference", unitName: "G", value: 22.84 },
          { nutrientId: 1004, nutrientNumber: "204", nutrientName: "Total lipid (fat)", unitName: "G", value: 0.33 },
        ],
      },
      {
        fdcId: 2000001,
        description: "Protein Bar, Chocolate",
        dataType: "Branded",
        brandOwner: "ACME FOODS",
        servingSize: 60,
        servingSizeUnit: "g",
        householdServingFullText: "1 bar",
        foodNutrients: [
          { nutrientId: 1008, unitName: "KCAL", value: 350 },
          { nutrientId: 1003, unitName: "G", value: 33.3 },
          { nutrientId: 1005, unitName: "G", value: 40 },
          { nutrientId: 1004, unitName: "G", value: 11.7 },
        ],
      },
      { fdcId: 3, description: "Foundation chicken", foodNutrients: [{ nutrientId: 2047, unitName: "KCAL", value: 120 }, { nutrientId: 1003, value: 22.5 }] },
      { fdcId: 4, description: "No energy data", foodNutrients: [{ nutrientId: 1003, value: 5 }] },
      { fdcId: 5, description: "BANANAS, RAW", foodNutrients: [{ nutrientId: 1008, unitName: "KCAL", value: 89 }] },
    ],
  };
  const r = parseUsdaSearch(json);

  it("parses generic foods per 100 g and title-cases names", () => {
    expect(r[0]).toMatchObject({ key: "usda:171705", name: "Bananas, Raw", brand: null, per100g: { kcal: 89, protein_g: 1.1, carbs_g: 22.8, fat_g: 0.3 }, serving: null });
  });
  it("derives a serving for branded foods", () => {
    expect(r[1].brand).toBe("Acme Foods");
    expect(r[1].serving).toEqual({ label: "1 bar (60 g)", grams: 60, nutr: { kcal: 210, protein_g: 20, carbs_g: 24, fat_g: 7 } });
  });
  it("falls back to Atwater energy, skips foods without energy, de-duplicates", () => {
    expect(r[2].per100g?.kcal).toBe(120);
    expect(r.map((x) => x.key)).toEqual(["usda:171705", "usda:2000001", "usda:3"]);
  });
});

describe("Open Food Facts", () => {
  it("uses per-serving values when present", () => {
    const f = parseOffProduct(
      {
        status: 1,
        product: {
          code: "3017624010438",
          product_name: "Nutella",
          brands: "Ferrero, Nutella",
          serving_size: "15 g",
          serving_quantity: 15,
          nutriments: { "energy-kcal_100g": 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, "energy-kcal_serving": 80.9, proteins_serving: 0.945, carbohydrates_serving: 8.62, fat_serving: 4.64 },
        },
      },
      "3017624010438",
    )!;
    expect(f).toMatchObject({ key: "off:3017624010438", name: "Nutella", brand: "Ferrero", per100g: { kcal: 539 } });
    expect(f.serving).toEqual({ label: "15 g", grams: 15, nutr: { kcal: 81, protein_g: 0.9, carbs_g: 8.6, fat_g: 4.6 } });
    expect(toDraft(f, "serving")).toMatchObject({ name: "Nutella (Ferrero)", serving: "15 g", kcal: 81 });
    expect(toDraft(f, "100g")).toMatchObject({ serving: "100 g", kcal: 539 });
  });
  it("computes the serving from per-100 g and converts kJ", () => {
    const f = parseOffProduct({ status: 1, product: { product_name: "Oat drink", serving_size: "250 ml", serving_quantity: "250", nutriments: { energy_100g: 192 } } }, "123")!;
    expect(f.per100g?.kcal).toBe(46);
    expect(f.serving?.nutr.kcal).toBe(115);
  });
  it("returns null when not found or no nutrition", () => {
    expect(parseOffProduct({ status: 0 }, "1")).toBeNull();
    expect(parseOffProduct({ status: 1, product: { product_name: "Mystery", nutriments: {} } }, "1")).toBeNull();
  });
});

describe("normalizeBarcode", () => {
  it("accepts retail lengths only", () => {
    expect(normalizeBarcode(" 0 12345 67890 5 ")).toBe("012345678905");
    expect(normalizeBarcode("12345")).toBeNull();
  });
});
