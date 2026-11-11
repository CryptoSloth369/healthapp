import Link from "next/link";
import { getMoodEntries, getMoodEntry, getRecentTags } from "@/lib/mood-data";
import { todayLocal } from "@/lib/today";
import { addDays } from "@/lib/dates";
import { dailyMood, PRESET_TAGS } from "@/lib/mood";
import { MoodHeatmap } from "@/components/mood-heatmap";
import { card } from "@/components/ui";
import { MoodForm } from "./mood-form";
import { MoodHistory } from "./mood-history";
import { MoodTabs } from "./mood-tabs";

export default async function MoodPage({ searchParams }: { searchParams: Promise<{ edit?: string; saved?: string }> }) {
  const [params, today] = await Promise.all([searchParams, todayLocal()]);
  const start = addDays(today, -7 * 13);
  const [entries, recentTags, editing] = await Promise.all([
    getMoodEntries(start, today),
    getRecentTags(),
    params.edit ? getMoodEntry(Number(params.edit)) : Promise.resolve(null),
  ]);
  const days = dailyMood(entries);
  const suggestions = [...new Set([...recentTags, ...PRESET_TAGS])].slice(0, 16);
  const sleepLoggedToday = entries.some((e) => e.logged_on === today && e.sleep_hours != null);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mood</h1>
      <MoodTabs active="checkin" />

      <section className={`${card} space-y-3`}>
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">{editing ? "Edit check-in" : "Check in"}</h2>
          {editing && (
            <Link href="/mood" className="text-sm text-muted">
              Cancel
            </Link>
          )}
        </div>
        {params.saved && !editing && <p className="text-sm text-accent">Saved. Check in again any time.</p>}
        <MoodForm
          key={editing?.id ?? "new"}
          today={today}
          entry={editing}
          tagSuggestions={suggestions}
          sleepLoggedToday={sleepLoggedToday}
        />
      </section>

      <section className={`${card} space-y-2`}>
        <h2 className="font-semibold">Last 12 weeks</h2>
        <MoodHeatmap days={days} today={today} />
      </section>

      <section className={card}>
        <h2 className="mb-2 font-semibold">Recent check-ins</h2>
        <MoodHistory entries={entries.slice(0, 30)} />
      </section>
    </div>
  );
}
