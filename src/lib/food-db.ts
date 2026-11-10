/**
 * Parse food database responses into one shape. Pure; no I/O.
 *
 * - USDA FoodData Central search (generic foods + branded): nutrients per 100 g.
 * - Open Food Facts product by barcode: per 100 g and often per serving.
 */

export type Nutr = { kcal: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null };

export type DbFood = {
  key: string; // "usda:123" / "off:3017624010438"
  source: "usda" | "off";
  name: string;
  brand: string | null;
  per100g: Nutr | null;
  serving: { label: string; grams: number | null; nutr: Nutr } | null;
};

const r1 = (v: number | null) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const titleCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s);

function scale(n: Nutr, factor: number): Nutr {
  return {
    kcal: Math.round(n.kcal * factor),
    protein_g: n.protein_g == null ? null : r1(n.protein_g * factor),
    carbs_g: n.carbs_g == null ? null : r1(n.carbs_g * factor),
    fat_g: n.fat_g == null ? null : r1(n.fat_g * factor),
  };
}

// ───────────── USDA ─────────────
type UsdaNutrient = { nutrientId?: number; nutrientNumber?: string; nutrientName?: string; unitName?: string; value?: number };
type UsdaFood = {
  fdcId: number;
  description?: string;
  dataType?: string;
  brandOwner?: string;
  brandName?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: UsdaNutrient[];
};

function usdaValue(list: UsdaNutrient[], ids: number[], numbers: string[]): number | null {
  for (const id of ids) {
    const n = list.find((x) => x.nutrientId === id);
    if (n?.value != null) return n.value;
  }
  for (const num of numbers) {
    const n = list.find((x) => x.nutrientNumber === num);
    if (n?.value != null) return n.value;
  }
  return null;
}

export function parseUsdaFood(f: UsdaFood): DbFood | null {
  const list = f.foodNutrients ?? [];
  // Energy (kcal): 1008; Foundation foods may only have Atwater energy (2047/2048).
  const kcalNutrient = list.find((x) => (x.nutrientId === 1008 || x.nutrientNumber === "208") && (x.unitName ?? "KCAL").toUpperCase() === "KCAL");
  const kcal = kcalNutrient?.value ?? usdaValue(list, [2048, 2047], ["958", "957"]);
  if (kcal == null || !f.description) return null;
  const per100g: Nutr = {
    kcal: Math.round(kcal),
    protein_g: r1(usdaValue(list, [1003], ["203"])),
    carbs_g: r1(usdaValue(list, [1005], ["205"])),
    fat_g: r1(usdaValue(list, [1004], ["204"])),
  };
  let serving: DbFood["serving"] = null;
  const unit = (f.servingSizeUnit ?? "").toLowerCase();
  if (f.servingSize && f.servingSize > 0 && (unit === "g" || unit === "grm" || unit === "ml" || unit === "mlt")) {
    const grams = f.servingSize;
    const unitLabel = unit.startsWith("m") ? "ml" : "g";
    const label = f.householdServingFullText ? `${f.householdServingFullText} (${Math.round(grams)} ${unitLabel})` : `${Math.round(grams)} ${unitLabel}`;
    serving = { label, grams, nutr: scale(per100g, grams / 100) };
  }
  return {
    key: `usda:${f.fdcId}`,
    source: "usda",
    name: titleCase(f.description.trim()),
    brand: f.brandName || f.brandOwner ? titleCase((f.brandName || f.brandOwner)!.trim()) : null,
    per100g,
    serving,
  };
}

export function parseUsdaSearch(json: unknown): DbFood[] {
  const foods = (json as { foods?: UsdaFood[] })?.foods ?? [];
  const out: DbFood[] = [];
  const seen = new Set<string>();
  for (const f of foods) {
    const p = parseUsdaFood(f);
    if (!p) continue;
    const k = `${p.name}|${p.brand ?? ""}`.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

// ───────────── Open Food Facts ─────────────
type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
};

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function parseOffProduct(json: unknown, barcode: string): DbFood | null {
  const j = json as { status?: number; product?: OffProduct };
  const p = j?.product;
  if (!p || j.status === 0) return null;
  const n = p.nutriments ?? {};
  let kcal100 = num(n["energy-kcal_100g"]);
  if (kcal100 == null && num(n["energy_100g"]) != null) kcal100 = num(n["energy_100g"])! / 4.184; // kJ → kcal
  const per100g: Nutr | null =
    kcal100 == null
      ? null
      : { kcal: Math.round(kcal100), protein_g: r1(num(n.proteins_100g)), carbs_g: r1(num(n.carbohydrates_100g)), fat_g: r1(num(n.fat_100g)) };

  let serving: DbFood["serving"] = null;
  const grams = num(p.serving_quantity);
  const kcalServing = num(n["energy-kcal_serving"]);
  if (p.serving_size) {
    if (kcalServing != null) {
      serving = {
        label: p.serving_size.trim(),
        grams,
        nutr: { kcal: Math.round(kcalServing), protein_g: r1(num(n.proteins_serving)), carbs_g: r1(num(n.carbohydrates_serving)), fat_g: r1(num(n.fat_serving)) },
      };
    } else if (per100g && grams) {
      serving = { label: p.serving_size.trim(), grams, nutr: scale(per100g, grams / 100) };
    }
  }
  if (!per100g && !serving) return null;
  const name = (p.product_name || p.product_name_en || "").trim();
  return {
    key: `off:${p.code ?? barcode}`,
    source: "off",
    name: name || `Product ${barcode}`,
    brand: p.brands ? p.brands.split(",")[0].trim() : null,
    per100g,
    serving,
  };
}

/** Valid retail barcode lengths (UPC-E/EAN-8, UPC-A, EAN-13, GTIN-14), digits only. */
export function normalizeBarcode(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  return [8, 12, 13, 14].includes(d.length) ? d : null;
}

/** Turn a database food into food-entry form values for a chosen portion. */
export function toDraft(f: DbFood, portion: "serving" | "100g") {
  const useServing = portion === "serving" && f.serving;
  const nutr = useServing ? f.serving!.nutr : f.per100g!;
  return {
    name: f.brand ? `${f.name} (${f.brand})` : f.name,
    serving: useServing ? f.serving!.label : "100 g",
    servings: 1,
    kcal: nutr.kcal,
    protein_g: nutr.protein_g,
    carbs_g: nutr.carbs_g,
    fat_g: nutr.fat_g,
    savedFoodId: null,
  };
}
