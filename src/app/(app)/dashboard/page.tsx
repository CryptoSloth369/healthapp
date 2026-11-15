import { redirect } from "next/navigation";
import { getProfileSummary } from "@/lib/profile";
import { getWeightHistory } from "@/lib/weight";
import { getEntriesBetween } from "@/lib/food";
import { getMoodEntries } from "@/lib/mood-data";
import { getBurnedByDay, getSessions } from "@/lib/exercise-data";
import { balanceContextStart } from "@/lib/energy-balance";
import { todayLocal } from "@/lib/today";
import { addDays } from "@/lib/dates";
import { ADAPTIVE_WINDOW, DashboardView, RANGES, type RangeKey } from "./dashboard-view";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const [{ range: rangeParam }, today] = await Promise.all([searchParams, todayLocal()]);
  const range: RangeKey = rangeParam && rangeParam in RANGES ? (rangeParam as RangeKey) : "4w";
  const start = addDays(today, -(RANGES[range].days - 1));
  const adaptiveStart = addDays(today, -ADAPTIVE_WINDOW);

  const [summary, history] = await Promise.all([getProfileSummary(), getWeightHistory()]);
  if (!summary) redirect("/login");
  // Back-calculated intake spreads each weigh-in window over all its days, so
  // load food and exercise from the start of the window the range begins in.
  const fetchStart = [adaptiveStart, start, balanceContextStart(history.points, start)].sort()[0];

  const [entries, moods, workouts, burned] = await Promise.all([
    getEntriesBetween(fetchStart, today),
    getMoodEntries(start, today),
    getSessions(start, today),
    getBurnedByDay(fetchStart, today),
  ]);
  return (
    <DashboardView
      range={range}
      today={today}
      summary={summary}
      history={history}
      entries={entries}
      moods={moods}
      workouts={workouts}
      burned={Object.fromEntries(burned)}
    />
  );
}

