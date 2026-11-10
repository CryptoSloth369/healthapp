"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isDay } from "@/lib/dates";
import { normalizeTags } from "@/lib/mood";

export type MoodFormState = { error?: string };

function level(form: FormData, key: string, required = false): number | null | "bad" {
  const s = String(form.get(key) ?? "");
  if (s === "") return required ? "bad" : null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : "bad";
}

export async function saveMood(_prev: MoodFormState, form: FormData): Promise<MoodFormState> {
  if (!(await getUserId())) return { error: "You are signed out." };
  const id = Number(form.get("id")) || null;
  const day = String(form.get("logged_on") ?? "");
  const mood = level(form, "mood", true);
  const energy = level(form, "energy");
  const stress = level(form, "stress");
  const sleepRaw = String(form.get("sleep_hours") ?? "").trim();
  const sleep = sleepRaw === "" ? null : Number(sleepRaw);
  const tags = normalizeTags(form.getAll("tags").map(String));
  const note = String(form.get("note") ?? "").trim().slice(0, 1000) || null;

  if (!isDay(day)) return { error: "Missing date." };
  if (mood === "bad" || mood == null) return { error: "Pick how you feel (1–5)." };
  if (energy === "bad" || stress === "bad") return { error: "Energy and stress are 1–5." };
  if (sleep != null && (!Number.isFinite(sleep) || sleep < 0 || sleep > 24)) return { error: "Sleep must be 0–24 hours." };

  const row = { logged_on: day, mood, energy, stress, sleep_hours: sleep, tags, note };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("mood_entry").update(row).eq("id", id)
    : await supabase.from("mood_entry").insert(row);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/mood?saved=1");
}

/** One-tap mood from the Today screen. */
export async function quickMood(mood: number, day: string): Promise<{ error?: string }> {
  if (!(await getUserId())) return { error: "You are signed out." };
  if (!Number.isInteger(mood) || mood < 1 || mood > 5 || !isDay(day)) return { error: "Invalid mood." };
  const supabase = await createClient();
  const { error } = await supabase.from("mood_entry").insert({ logged_on: day, mood });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}

export async function deleteMood(id: number) {
  if (!(await getUserId())) return;
  const supabase = await createClient();
  await supabase.from("mood_entry").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect("/mood");
}
