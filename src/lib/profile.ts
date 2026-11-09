import "server-only";
import { createClient, getUserId } from "@/lib/supabase/server";
import { ageOn, calorieTarget, macroSplit, type CalorieTarget, type Macros } from "@/lib/tdee";
import { parseDay } from "@/lib/dates";
import type { Profile, WeightEntry } from "@/lib/types";

export type ProfileSummary = {
  profile: Profile;
  latestWeight: WeightEntry | null;
  /** null until enough stats are filled in. */
  target: CalorieTarget | null;
  /** What the app actually aims for: the manual override if set, else the calculated target. */
  daily: { kcal: number; macros: Macros } | null;
  missing: string[];
};

export async function getProfileSummary(): Promise<ProfileSummary | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const supabase = await createClient();

  const [{ data: profile }, { data: latestWeight }] = await Promise.all([
    supabase.from("profile").select("*").eq("user_id", userId).single<Profile>(),
    supabase
      .from("weight_entry")
      .select("*")
      .order("measured_on", { ascending: false })
      .limit(1)
      .maybeSingle<WeightEntry>(),
  ]);
  if (!profile) return null;

  const missing: string[] = [];
  if (!profile.sex) missing.push("sex");
  if (!profile.birth_date) missing.push("birth date");
  if (!profile.height_in) missing.push("height");
  if (!latestWeight) missing.push("current weight");

  const target =
    missing.length === 0
      ? calorieTarget({
          sex: profile.sex!,
          age: ageOn(parseDay(profile.birth_date!)),
          heightIn: Number(profile.height_in),
          weightLb: Number(latestWeight!.weight_lb),
          activity: profile.activity_level,
          goalWeightLb: profile.goal_weight_lb == null ? null : Number(profile.goal_weight_lb),
          goalDate: profile.goal_date ? parseDay(profile.goal_date) : null,
        })
      : null;

  const override = profile.kcal_target_override;
  const refWeight =
    profile.goal_weight_lb != null ? Number(profile.goal_weight_lb) : latestWeight ? Number(latestWeight.weight_lb) : null;
  const daily =
    override != null && refWeight != null
      ? { kcal: override, macros: macroSplit(override, refWeight) }
      : target
        ? { kcal: target.targetKcal, macros: target.macros }
        : null;

  return { profile, latestWeight: latestWeight ?? null, target, daily, missing };
}
