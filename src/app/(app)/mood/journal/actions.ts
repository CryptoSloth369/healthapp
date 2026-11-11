"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isDay } from "@/lib/dates";
import { normalizeBody } from "@/lib/journal";

export type JournalFormState = { error?: string };

export async function saveJournal(_prev: JournalFormState, form: FormData): Promise<JournalFormState> {
  if (!(await getUserId())) return { error: "You are signed out." };
  const id = Number(form.get("id")) || null;
  const day = String(form.get("written_on") ?? "");
  const body = normalizeBody(String(form.get("body") ?? ""));

  if (!isDay(day)) return { error: "Missing date." };
  if (!body) return { error: "Write or dictate something first." };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("journal_entry").update({ written_on: day, body, updated_at: new Date().toISOString() }).eq("id", id)
    : await supabase.from("journal_entry").insert({ written_on: day, body });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/mood/journal?saved=1");
}

export async function deleteJournal(id: number) {
  if (!(await getUserId())) return;
  const supabase = await createClient();
  await supabase.from("journal_entry").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect("/mood/journal");
}
