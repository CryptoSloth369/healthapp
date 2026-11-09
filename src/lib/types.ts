// Hand-written row types for now. Once the Supabase project exists we can
// generate these with `npx supabase gen types typescript`.
import type { ActivityLevel, Sex } from "./tdee";

export type Profile = {
  user_id: string;
  display_name: string | null;
  sex: Sex | null;
  birth_date: string | null; // YYYY-MM-DD
  height_in: number | null;
  activity_level: ActivityLevel;
  goal_weight_lb: number | null;
  goal_date: string | null; // YYYY-MM-DD
  kcal_target_override: number | null;
};

export type WeightEntry = {
  id: number;
  measured_on: string;
  weight_lb: number;
  body_fat_pct: number | null;
  note: string | null;
};
