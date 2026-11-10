"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { estimateFromPhoto, EstimateError } from "@/lib/photo-estimate";
import type { PhotoEstimate } from "@/lib/photo-estimate-schema";
import { CONFIDENCE_SCORE } from "@/lib/photo-estimate-schema";
import { isDay } from "@/lib/dates";
import { isMeal, scaleNutrients } from "@/lib/nutrition";

const MAX_BASE64 = 3_000_000; // ~2.2 MB image; the client resizes well below this
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

function parseDataUrl(dataUrl: string) {
  const m = DATA_URL.exec(dataUrl);
  if (!m || m[2].length > MAX_BASE64) return null;
  return { mediaType: m[1] as "image/jpeg" | "image/png" | "image/webp", base64: m[2] };
}

export type EstimateResult = { estimate: PhotoEstimate } | { error: string };

export async function estimatePhotoAction(imageDataUrl: string, hint: string): Promise<EstimateResult> {
  if (!(await getUserId())) return { error: "You are signed out." };
  const img = parseDataUrl(imageDataUrl);
  if (!img) return { error: "That image couldn't be read. Try another photo." };
  try {
    const estimate = await estimateFromPhoto({ imageBase64: img.base64, mediaType: img.mediaType, hint: hint.slice(0, 500) });
    return { estimate };
  } catch (err) {
    if (err instanceof EstimateError) return { error: err.message };
    console.error("photo estimate failed", err);
    return { error: "Something went wrong estimating that photo. Try again." };
  }
}

export type ReviewedItem = {
  name: string;
  portion: string;
  servings: number;
  kcal: number; // per estimated portion
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  confidence: "low" | "medium" | "high";
};

export async function savePhotoItems(input: {
  day: string;
  meal: string;
  items: ReviewedItem[];
  imageDataUrl: string | null;
}): Promise<{ error: string } | void> {
  const userId = await getUserId();
  if (!userId) return { error: "You are signed out." };
  if (!isDay(input.day)) return { error: "Missing date." };
  if (!isMeal(input.meal)) return { error: "Pick a meal." };
  const items = input.items.filter((i) => i.name.trim());
  if (items.length === 0) return { error: "Select at least one item." };
  for (const i of items) {
    if (!Number.isFinite(i.kcal) || i.kcal < 0 || i.kcal > 10000) return { error: `Check the calories for ${i.name}.` };
    if (!Number.isFinite(i.servings) || i.servings <= 0 || i.servings > 20) return { error: `Check the amount for ${i.name}.` };
  }

  const supabase = await createClient();

  // Keep the photo (private bucket, under the user's own folder).
  let photoPath: string | null = null;
  const img = input.imageDataUrl ? parseDataUrl(input.imageDataUrl) : null;
  if (img) {
    const ext = img.mediaType.split("/")[1];
    const path = `${userId}/${input.day}/${randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("meal-photos")
      .upload(path, Buffer.from(img.base64, "base64"), { contentType: img.mediaType });
    if (!error) photoPath = path;
    else console.error("photo upload failed", error.message); // entries still save without the photo
  }

  const rows = items.map((i) => ({
    eaten_on: input.day,
    meal: input.meal as "breakfast" | "lunch" | "dinner" | "snack",
    name: i.name.trim().slice(0, 120),
    serving: i.portion.trim().slice(0, 60) || null,
    servings: i.servings,
    ...scaleNutrients({ kcal: i.kcal, protein_g: i.protein_g, carbs_g: i.carbs_g, fat_g: i.fat_g }, i.servings),
    source: "photo" as const,
    photo_path: photoPath,
    ai_confidence: CONFIDENCE_SCORE[i.confidence] ?? null,
  }));
  const { error } = await supabase.from("food_entry").insert(rows);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect(`/food?day=${input.day}`);
}
