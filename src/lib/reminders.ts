import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ReminderPrefs = {
  enabled: boolean;
  timezone: string;
  weigh_in_at: string | null; // "HH:MM:SS"
  food_at: string | null;
  mood_at: string | null;
};

export async function getReminderPrefs(): Promise<{ prefs: ReminderPrefs | null; devices: number }> {
  const supabase = await createClient();
  const [{ data: prefs }, { count }] = await Promise.all([
    supabase.from("reminder_pref").select("enabled, timezone, weigh_in_at, food_at, mood_at").maybeSingle<ReminderPrefs>(),
    supabase.from("push_subscription").select("id", { count: "exact", head: true }),
  ]);
  return { prefs: prefs ?? null, devices: count ?? 0 };
}
