import "server-only";
import { createClient } from "@/lib/supabase/server";
import { computeTrend, weeklyRate, type TrendPoint } from "@/lib/trend";
import type { WeightEntry } from "@/lib/types";

export type WeightHistory = {
  entries: WeightEntry[]; // newest first
  points: TrendPoint[]; // oldest first, with trend
  rateLbPerWeek: number | null;
};

export async function getWeightHistory(): Promise<WeightHistory> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("weight_entry")
    .select("id, measured_on, weight_lb, body_fat_pct, note")
    .order("measured_on", { ascending: true })
    .overrideTypes<WeightEntry[], { merge: false }>();
  const asc = (data ?? []).map((e) => ({ ...e, weight_lb: Number(e.weight_lb) }));
  const points = computeTrend(asc.map((e) => ({ day: e.measured_on, weight: e.weight_lb })));
  return { entries: [...asc].reverse(), points, rateLbPerWeek: weeklyRate(points) };
}
