import { redirect } from "next/navigation";
import { getProfileSummary } from "@/lib/profile";
import { getWeightHistory } from "@/lib/weight";
import { getEntriesBetween } from "@/lib/food";
import { getMoodEntries } from "@/lib/mood-data";
import { getSessions } from "@/lib/exercise-data";
import { todayLocal } from "@/lib/today";
import { addDays } from "@/lib/dates";
import { ADAPTIVE_WINDOW, DashboardView, RANGES, type RangeKey } from "./dashboard-view";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const [{ range: rangeParam }, today] = await Promise.all([searchParams, todayLocal()]);
  const range: RangeKey = rangeParam && rangeParam in RANGES ? (rangeParam as RangeKey) : "4w";
  const start = addDays(today, -(RANGES[range].days - 1));
  const adaptiveStart = addDays(today, -ADAPTIVE_WINDOW);
  const fetchStart = adaptiveStart < start ? adaptiveStart : start;

  const [summary, history, entries, moods, workouts] = await Promise.all([
    getProfileSummary(),
    getWeightHistory(),
    getEntriesBetween(fetchStart, today),
    getMoodEntries(start, today),
    getSessions(start, today),
  ]);
  if (!summary) redirect("/login");
  return (
    <DashboardView range={range} today={today} summary={summary} history={history} entries={entries} moods={moods} workouts={workouts} />
  );
}

