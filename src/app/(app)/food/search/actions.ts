"use server";

import { getUserId } from "@/lib/supabase/server";
import { normalizeBarcode, parseOffProduct, parseUsdaSearch, type DbFood } from "@/lib/food-db";

const USDA = "https://api.nal.usda.gov/fdc/v1/foods/search";
// Open Food Facts asks apps to identify themselves; no personal contact info is sent.
const OFF_HEADERS = { "User-Agent": "PersonalHealthTracker/1.0 (private, non-commercial)" };

function usdaKey() {
  return process.env.USDA_API_KEY || "DEMO_KEY";
}

async function usdaSearch(query: string, dataType: string[], pageSize = 25) {
  const res = await fetch(`${USDA}?api_key=${encodeURIComponent(usdaKey())}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, pageSize, dataType }),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (res.status === 429) throw new Error("rate");
  if (!res.ok) throw new Error(`USDA ${res.status}`);
  return res.json();
}

export type SearchResult = { foods: DbFood[] } | { error: string };

/** Text search: USDA generic foods first, then branded products. */
export async function searchFoodDb(query: string): Promise<SearchResult> {
  if (!(await getUserId())) return { error: "You are signed out." };
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return { foods: [] };
  try {
    const [generic, branded] = await Promise.all([
      usdaSearch(q, ["Foundation", "SR Legacy", "Survey (FNDDS)"], 15),
      usdaSearch(q, ["Branded"], 15),
    ]);
    return { foods: [...parseUsdaSearch(generic), ...parseUsdaSearch(branded)].slice(0, 30) };
  } catch (err) {
    if ((err as Error).message === "rate")
      return { error: "The food database's shared demo key is busy. Add a free USDA_API_KEY in Vercel (see README)." };
    console.error("food search failed", err);
    return { error: "Food search is unavailable right now. Try again, or enter it manually." };
  }
}

export type BarcodeResult = { food: DbFood } | { notFound: true; barcode: string } | { error: string };

/** Barcode lookup: Open Food Facts, then USDA branded foods by UPC. */
export async function lookupBarcode(raw: string): Promise<BarcodeResult> {
  if (!(await getUserId())) return { error: "You are signed out." };
  const code = normalizeBarcode(raw);
  if (!code) return { error: "That doesn't look like a product barcode." };

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=code,product_name,product_name_en,brands,serving_size,serving_quantity,nutriments`,
      { headers: OFF_HEADERS, signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
    if (res.ok || res.status === 404) {
      const food = parseOffProduct(await res.json().catch(() => null), code);
      if (food) return { food };
    }
  } catch (err) {
    console.error("Open Food Facts lookup failed", err);
  }

  try {
    const json = (await usdaSearch(code, ["Branded"], 5)) as { foods?: { gtinUpc?: string }[] };
    const strip = (s: string) => s.replace(/^0+/, "");
    const match = (json.foods ?? []).filter((f) => f.gtinUpc && strip(f.gtinUpc) === strip(code));
    const [food] = parseUsdaSearch({ foods: match });
    if (food) return { food };
  } catch (err) {
    console.error("USDA barcode lookup failed", err);
  }
  return { notFound: true, barcode: code };
}
