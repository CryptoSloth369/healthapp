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

export type FoodEntry = {
  id: number;
  eaten_on: string;
  meal: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  servings: number;
  serving: string | null;
  kcal: number; // totals for the entry (already × servings)
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  source: "manual" | "saved" | "photo" | "barcode" | "search";
  saved_food_id: number | null;
  photo_path: string | null;
  ai_confidence: number | null;
  note: string | null;
};

export type SavedFood = {
  id: number;
  name: string;
  serving: string | null;
  kcal: number; // per serving
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  use_count: number;
  last_used_at: string | null;
};

export type MoodEntry = {
  id: number;
  logged_on: string;
  logged_at: string;
  mood: number;
  energy: number | null;
  stress: number | null;
  sleep_hours: number | null;
  tags: string[];
  note: string | null;
};
