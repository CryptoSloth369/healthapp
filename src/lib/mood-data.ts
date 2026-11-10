import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MoodEntry } from "@/lib/types";

const COLS = "id, logged_on, logged_at, mood, energy, stress, sleep_hours, tags, note";

function normalize(e: MoodEntry): MoodEntry {
  return { ...e, sleep_hours: e.sleep_hours == null ? null : Number(e.sleep_hours), tags: e.tags ?? [] };
}

/** Check-ins between two days (inclusive), newest first. */
export async function getMoodEntries(start: string, end: string): Promise<MoodEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("mood_entry")
    .select(COLS)
    .gte("logged_on", start)
    .lte("logged_on", end)
    .order("logged_at", { ascending: false })
    .limit(2000)
    .overrideTypes<MoodEntry[], { merge: false }>();
  return (data ?? []).map(normalize);
}

export async function getMoodEntry(id: number): Promise<MoodEntry | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("mood_entry").select(COLS).eq("id", id).maybeSingle<MoodEntry>();
  return data ? normalize(data) : null;
}

/** Tags used before, most frequent first (for suggestions). */
export async function getRecentTags(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("mood_entry")
    .select("tags")
    .order("logged_at", { ascending: false })
    .limit(200)
    .overrideTypes<{ tags: string[] }[], { merge: false }>();
  const counts = new Map<string, number>();
  for (const r of data ?? []) for (const t of r.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}
