import Link from "next/link";
import { getJournalEntry, getLatestJournalEntries } from "@/lib/journal-data";
import { getMoodEntries } from "@/lib/mood-data";
import { todayLocal } from "@/lib/today";
import { isDay } from "@/lib/dates";
import { dailyMood } from "@/lib/mood";
import { JOURNAL_KINDS, pageByDay } from "@/lib/journal";
import type { JournalEntry, JournalKind } from "@/lib/types";
import { card } from "@/components/ui";
import { MoodTabs } from "../mood-tabs";
import { JournalForm } from "./journal-form";
import { JournalList } from "./journal-list";

const PAGE = 30;

export type JournalSearchParams = { edit?: string; saved?: string; from?: string };

/** Loads one journal (regular or dreams) for the page at JOURNAL_KINDS[kind].path. */
export async function JournalScreen({ kind, searchParams }: { kind: JournalKind; searchParams: Promise<JournalSearchParams> }) {
  const [params, today] = await Promise.all([searchParams, todayLocal()]);
  const from = isDay(params.from) && params.from < today ? params.from : today;
  const [fetched, found] = await Promise.all([
    getLatestJournalEntries(kind, from, PAGE + 1),
    params.edit ? getJournalEntry(Number(params.edit)) : Promise.resolve(null),
  ]);
  const { items, olderFrom } = pageByDay(fetched, PAGE);
  const moods = items.length ? await getMoodEntries(items.at(-1)!.written_on, items[0].written_on) : [];
  const moodByDay = Object.fromEntries(dailyMood(moods).map((d) => [d.day, d.mood]));

  return (
    <JournalView
      kind={kind}
      today={today}
      from={from}
      entries={items}
      olderFrom={olderFrom}
      moodByDay={moodByDay}
      editing={found?.kind === kind ? found : null}
      saved={!!params.saved}
    />
  );
}

export function JournalView({
  kind,
  today,
  from,
  entries,
  olderFrom,
  moodByDay,
  editing,
  saved,
}: {
  kind: JournalKind;
  today: string;
  from: string;
  entries: JournalEntry[];
  olderFrom: string | null;
  moodByDay: Record<string, number>;
  editing: JournalEntry | null;
  saved: boolean;
}) {
  const info = JOURNAL_KINDS[kind];
  const dreams = kind === "dream";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mood</h1>
      <MoodTabs active={kind} />

      <section className={`${card} space-y-3`}>
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">{editing ? (dreams ? "Edit dream" : "Edit entry") : dreams ? "New dream" : "New entry"}</h2>
          {editing && (
            <Link href={info.path} className="text-sm text-muted">
              Cancel
            </Link>
          )}
        </div>
        {saved && !editing && <p className="text-sm text-accent">{info.saved}</p>}
        <JournalForm key={editing?.id ?? "new"} kind={kind} today={today} entry={editing} />
      </section>

      <section className={`${card} space-y-2`}>
        <h2 className="font-semibold">
          {dreams ? "Dreams" : "Entries"}
          {from !== today && ` up to ${from}`}
        </h2>
        <JournalList entries={entries} moodByDay={moodByDay} empty={info.empty} />
        <div className="flex justify-between pt-1 text-sm">
          {from !== today ? (
            <Link href={info.path} className="text-muted">
              ← Newest
            </Link>
          ) : (
            <span />
          )}
          {olderFrom && (
            <Link href={`${info.path}?from=${olderFrom}`} className="font-medium text-accent">
              Older {dreams ? "dreams" : "entries"} →
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
