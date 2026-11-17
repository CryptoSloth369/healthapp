import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { JournalEntry, JournalKind } from "@/lib/types";

const COLS = "id, kind, written_on, written_at, updated_at, body, tags";

const normalize = (e: JournalEntry): JournalEntry => ({ ...e, tags: e.tags ?? [] });

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
  return (data ?? []).map(normalize);
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
  return (data ?? []).map(normalize);
}

export async function getJournalEntry(id: number): Promise<JournalEntry | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("journal_entry").select(COLS).eq("id", id).maybeSingle<JournalEntry>();
  return data ? normalize(data) : null;
}

/** Tags used before on one kind of entry, most frequent first (for suggestions). */
export async function getRecentJournalTags(kind: JournalKind): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("journal_entry")
    .select("tags")
    .eq("kind", kind)
    .order("written_at", { ascending: false })
    .limit(200)
    .overrideTypes<{ tags: string[] }[], { merge: false }>();
  const counts = new Map<string, number>();
  for (const r of data ?? []) for (const t of r.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}
