import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { JournalEntry } from "@/lib/types";

const COLS = "id, written_on, written_at, updated_at, body";

/** Entries between two days (inclusive), newest first. */
export async function getJournalEntries(start: string, end: string, limit = 500): Promise<JournalEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("journal_entry")
    .select(COLS)
    .gte("written_on", start)
    .lte("written_on", end)
    .order("written_on", { ascending: false })
    .order("written_at", { ascending: false })
    .limit(limit)
    .overrideTypes<JournalEntry[], { merge: false }>();
  return data ?? [];
}

/** The newest `limit` entries on or before a day, newest first. */
export async function getLatestJournalEntries(onOrBefore: string, limit: number): Promise<JournalEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("journal_entry")
    .select(COLS)
    .lte("written_on", onOrBefore)
    .order("written_on", { ascending: false })
    .order("written_at", { ascending: false })
    .limit(limit)
    .overrideTypes<JournalEntry[], { merge: false }>();
  return data ?? [];
}

export async function getJournalEntry(id: number): Promise<JournalEntry | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("journal_entry").select(COLS).eq("id", id).maybeSingle<JournalEntry>();
  return data ?? null;
}
