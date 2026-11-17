import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { JournalEntry, JournalKind } from "@/lib/types";

const COLS = "id, kind, written_on, written_at, updated_at, body";

/** Entries between two days (inclusive), newest first. Both kinds unless `kind` is given. */
export async function getJournalEntries(start: string, end: string, limit = 500, kind?: JournalKind): Promise<JournalEntry[]> {
  const supabase = await createClient();
  let query = supabase.from("journal_entry").select(COLS);
  if (kind) query = query.eq("kind", kind);
  const { data } = await query
    .gte("written_on", start)
    .lte("written_on", end)
    .order("written_on", { ascending: false })
    .order("written_at", { ascending: false })
    .limit(limit)
    .overrideTypes<JournalEntry[], { merge: false }>();
  return data ?? [];
}

/** The newest `limit` entries of one kind on or before a day, newest first. */
export async function getLatestJournalEntries(kind: JournalKind, onOrBefore: string, limit: number): Promise<JournalEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("journal_entry")
    .select(COLS)
    .eq("kind", kind)
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
