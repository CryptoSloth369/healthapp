"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isDay } from "@/lib/dates";
import { JOURNAL_KINDS, isJournalKind, normalizeBody } from "@/lib/journal";
import type { JournalKind } from "@/lib/types";

export type JournalFormState = { error?: string };

export async function saveJournal(_prev: JournalFormState, form: FormData): Promise<JournalFormState> {
  if (!(await getUserId())) return { error: "You are signed out." };
  const id = Number(form.get("id")) || null;
  const day = String(form.get("written_on") ?? "");
  const body = normalizeBody(String(form.get("body") ?? ""));
  const kind = form.get("kind") ?? "journal";

  if (!isJournalKind(kind)) return { error: "Unknown journal." };
  if (!isDay(day)) return { error: "Missing date." };
  if (!body) return { error: "Write or dictate something first." };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("journal_entry").update({ kind, written_on: day, body, updated_at: new Date().toISOString() }).eq("id", id)
    : await supabase.from("journal_entry").insert({ kind, written_on: day, body });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect(`${JOURNAL_KINDS[kind].path}?saved=1`);
}

export async function deleteJournal(id: number, kind: JournalKind = "journal") {
  if (!(await getUserId())) return;
  const supabase = await createClient();
  await supabase.from("journal_entry").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect(isJournalKind(kind) ? JOURNAL_KINDS[kind].path : "/mood/journal");
}
