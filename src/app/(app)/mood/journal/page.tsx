import Link from "next/link";
import { getJournalEntry, getLatestJournalEntries } from "@/lib/journal-data";
import { getMoodEntries } from "@/lib/mood-data";
import { todayLocal } from "@/lib/today";
import { isDay } from "@/lib/dates";
import { dailyMood } from "@/lib/mood";
import { pageByDay } from "@/lib/journal";
import { card } from "@/components/ui";
import { MoodTabs } from "../mood-tabs";
import { JournalForm } from "./journal-form";
import { JournalList } from "./journal-list";

const PAGE = 30;

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; saved?: string; from?: string }>;
}) {
  const [params, today] = await Promise.all([searchParams, todayLocal()]);
  const from = isDay(params.from) && params.from < today ? params.from : today;
  const [fetched, editing] = await Promise.all([
    getLatestJournalEntries(from, PAGE + 1),
    params.edit ? getJournalEntry(Number(params.edit)) : Promise.resolve(null),
  ]);
  const { items, olderFrom } = pageByDay(fetched, PAGE);
  const moods = items.length ? await getMoodEntries(items.at(-1)!.written_on, items[0].written_on) : [];
  const moodByDay = Object.fromEntries(dailyMood(moods).map((d) => [d.day, d.mood]));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mood</h1>
      <MoodTabs active="journal" />

      <section className={`${card} space-y-3`}>
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">{editing ? "Edit entry" : "New entry"}</h2>
          {editing && (
            <Link href="/mood/journal" className="text-sm text-muted">
              Cancel
            </Link>
          )}
        </div>
        {params.saved && !editing && <p className="text-sm text-accent">Saved to your journal.</p>}
        <JournalForm key={editing?.id ?? "new"} today={today} entry={editing} />
      </section>

      <section className={`${card} space-y-2`}>
        <h2 className="font-semibold">{from === today ? "Entries" : `Entries up to ${from}`}</h2>
        <JournalList entries={items} moodByDay={moodByDay} />
        <div className="flex justify-between pt-1 text-sm">
          {from !== today ? (
            <Link href="/mood/journal" className="text-muted">
              ← Newest
            </Link>
          ) : (
            <span />
          )}
          {olderFrom && (
            <Link href={`/mood/journal?from=${olderFrom}`} className="font-medium text-accent">
              Older entries →
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
